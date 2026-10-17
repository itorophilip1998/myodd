"""Versioned odds baseline and historical-goals Poisson model.

Confidence is a ranking score, not a calibrated probability of winning a slip.
"""
import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from .odds_policy import MIN_SELECTION_ODDS
from .schemas import Fixture, Market, ScoredSelection


def supported_market(market_id: str, specifier: str, outcome_id: str, name: str):
    name = name.lower().strip()
    if market_id == '1':
        if outcome_id == '1' or name in ('home', '1'):
            return Market.HOME
        if outcome_id == '2' or name in ('draw', 'x'):
            return Market.DRAW
        if outcome_id == '3' or name in ('away', '2'):
            return Market.AWAY
    if market_id == '10':
        return {'9': Market.DOUBLE_CHANCE_1X, '10': Market.DOUBLE_CHANCE_12, '11': Market.DOUBLE_CHANCE_X2}.get(outcome_id) or {'1x': Market.DOUBLE_CHANCE_1X, '12': Market.DOUBLE_CHANCE_12, 'x2': Market.DOUBLE_CHANCE_X2}.get(name)
    if market_id == '18':
        total = dict(part.split('=', 1) for part in specifier.split('|') if '=' in part).get('total')
        over = outcome_id == '12' or name.startswith('over')
        under = outcome_id == '13' or name.startswith('under')
        if total == '1.5' and over:
            return Market.OVER_1_5
        if total == '2.5' and over:
            return Market.OVER_2_5
        if total == '3.5' and under:
            return Market.UNDER_3_5
    if market_id == '29':
        return {'74': Market.BTTS_YES, '76': Market.BTTS_NO}.get(outcome_id) or {'yes': Market.BTTS_YES, 'no': Market.BTTS_NO}.get(name)
    return Market.OTHER


class OddsModel:
    version = 'odds-v2'

    def probability(self, fixture, market, outcome, supported):
        active = [o for o in market.outcomes if o.isActive]
        raw = 1 / outcome.odds
        if supported == Market.OTHER:
            if complete_interval_result(market):
                return raw / sum(1 / o.odds for o in active)
            return min(.999, raw)
        # Double-chance outcomes overlap: each match result is covered twice.
        if market.marketId == '10':
            result_market = next((m for m in fixture.markets if m.marketId == '1' and len([o for o in m.outcomes if o.isActive]) == 3), None)
            if result_market:
                weights = {o.outcomeId: 1 / o.odds for o in result_market.outcomes if o.isActive}
                ids = {Market.DOUBLE_CHANCE_1X: ('1', '2'), Market.DOUBLE_CHANCE_X2: ('2', '3'), Market.DOUBLE_CHANCE_12: ('1', '3')}[supported]
                if all(key in weights for key in ('1', '2', '3')):
                    return sum(weights[key] for key in ids) / sum(weights.values())
            return min(.99, raw * 2 / sum(1 / o.odds for o in active)) if len(active) == 3 else min(.99, raw)
        expected = 3 if market.marketId == '1' else 2
        return raw / sum(1 / o.odds for o in active) if len(active) == expected else min(.99, raw)


def complete_interval_result(market):
    """Only normalize a complete, mutually exclusive interval home/draw/away market."""
    name = market.marketName.casefold()
    if not ('1x2' in name and re.search(r'min(?:ute)?s?\b', name)):
        return False
    if re.search(r'\b[12]up\b|early|payout|&|\band\b', name):
        return False
    aliases = {'home': 'home', '1': 'home', 'draw': 'draw', 'x': 'draw', 'away': 'away', '2': 'away'}
    return len(market.outcomes) == 3 and all(o.isActive for o in market.outcomes) and {
        aliases.get(o.outcomeName.strip().casefold()) for o in market.outcomes
    } == {'home', 'draw', 'away'}


class PoissonModel:
    def __init__(self, path: str):
        self.artifact = json.loads(Path(path).read_text())
        self.version = self.artifact['version']
        if self.artifact['model'] != 'poisson-v1':
            raise ValueError('Unsupported model artifact')
        self.fallback = OddsModel()

    def probability(self, fixture, market, outcome, supported):
        league = self.artifact['leagues'].get(fixture.league)
        if supported == Market.OTHER or not league:
            return self.fallback.probability(fixture, market, outcome, supported)
        home = league['teams'].get(fixture.homeTeam)
        away = league['teams'].get(fixture.awayTeam)
        if not home or not away:
            return self.fallback.probability(fixture, market, outcome, supported)
        home_rate = max(.05, min(8, league['homeGoals'] * home['homeAttack'] * away['awayDefence']))
        away_rate = max(.05, min(8, league['awayGoals'] * away['awayAttack'] * home['homeDefence']))
        probs = {m: 0.0 for m in Market}
        mass = 0.0
        for h in range(30):
            ph = math.exp(-home_rate) * home_rate ** h / math.factorial(h)
            for a in range(30):
                p = ph * math.exp(-away_rate) * away_rate ** a / math.factorial(a)
                mass += p
                matches = {Market.HOME: h > a, Market.DRAW: h == a, Market.AWAY: a > h,
                           Market.DOUBLE_CHANCE_1X: h >= a, Market.DOUBLE_CHANCE_X2: a >= h,
                           Market.DOUBLE_CHANCE_12: h != a, Market.OVER_1_5: h + a > 1,
                           Market.OVER_2_5: h + a > 2, Market.UNDER_3_5: h + a < 4,
                           Market.BTTS_YES: h > 0 and a > 0, Market.BTTS_NO: h == 0 or a == 0}
                for key, matched in matches.items():
                    if matched:
                        probs[key] += p
        return probs[supported] / mass


def load_model():
    name = os.getenv('PREDICTION_MODEL', 'odds')
    if name == 'odds':
        return OddsModel()
    if name == 'poisson':
        return PoissonModel(os.getenv('MODEL_PATH', '/data/model.json'))
    raise ValueError(f'Unknown prediction model: {name}')


def score_fixtures(fixtures: list[Fixture], model) -> list[ScoredSelection]:
    scored = []
    now = datetime.now(timezone.utc)
    for fixture in fixtures:
        if fixture.kickoffAt.tzinfo is None or fixture.kickoffAt <= now:
            continue
        for market in fixture.markets:
            if market.status.lower() not in ('', '0', 'active', 'open'):
                continue
            for outcome in market.outcomes:
                supported = supported_market(market.marketId, market.specifier, outcome.outcomeId, outcome.outcomeName)
                if not supported or not outcome.isActive or outcome.odds < MIN_SELECTION_ODDS:
                    continue
                probability = max(.001, min(.999, model.probability(fixture, market, outcome, supported)))
                # Explicitly identify fallback predictions for uncovered teams/leagues.
                interval = complete_interval_result(market)
                version = ('odds-interval-v1' if interval else 'odds-raw-v1') if supported == Market.OTHER else model.version
                if isinstance(model, PoissonModel):
                    league = model.artifact['leagues'].get(fixture.league, {})
                    if supported == Market.OTHER:
                        version = 'odds-interval-v1' if interval else 'odds-raw-v1'
                    elif fixture.homeTeam not in league.get('teams', {}) or fixture.awayTeam not in league.get('teams', {}):
                        version = model.fallback.version
                scored.append(ScoredSelection(
                    eventId=fixture.eventId, marketId=market.marketId, outcomeId=outcome.outcomeId,
                    specifier=market.specifier, odds=outcome.odds, homeTeam=fixture.homeTeam,
                    awayTeam=fixture.awayTeam, league=fixture.league, marketName=market.marketName,
                    selectionName=outcome.outcomeName, kickoffAt=fixture.kickoffAt,
                    supportedMarket=supported, probability=round(probability, 6),
                    confidence=round(probability * 100, 2), modelVersion=version,
                ))
    return scored

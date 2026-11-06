"""Over 1.5 Machine ticket gates.

Eligible fixtures: Vedic Lahiri Aries rising at kickoff (stadium).
Markets: Over 1.5 goals; if that price is below 1.11, use Over 2.5 instead.
Leg odds must be ≤ 1.25 (and ≥ 1.10).
"""
from __future__ import annotations

import re

from app.llms.vedic_o15 import cast_rising, over15_probability, over25_probability
from app.schemas import Market, ScoredSelection

MAX_LEG_ODDS = 1.25
O15_FLOOR = 1.11  # below this → switch to Over 2.5


def _line(specifier: str, name: str) -> float | None:
    for part in (specifier or '').split('|'):
        if part.startswith('total='):
            try:
                return float(part.split('=', 1)[1])
            except ValueError:
                return None
    match = re.search(r'(\d+(?:\.\d+)?)', name or '')
    return float(match.group(1)) if match else None


def _is_over(outcome_name: str, outcome_id: str) -> bool:
    name = (outcome_name or '').casefold()
    return outcome_id in ('12', 'over') or name.startswith('over')


def is_goals_total_over(selection: ScoredSelection, line: float) -> bool:
    if not _is_over(selection.selectionName, selection.outcomeId):
        return False
    name = (selection.marketName or '').casefold()
    if re.search(r'corner|shot|card|kick|tackle|half|home|away|competitor', name):
        return False
    if selection.supportedMarket == Market.OVER_1_5 and abs(line - 1.5) < 1e-6:
        return True
    if selection.supportedMarket == Market.OVER_2_5 and abs(line - 2.5) < 1e-6:
        return True
    got = _line(selection.specifier, selection.selectionName)
    return got is not None and abs(got - line) < 1e-6 and (
        'over/under' in name or 'total' in name or selection.marketId == '18'
    )


def over15_market_allowed(market_id: str, market_name: str, specifier: str, outcome_name: str, odds: float) -> bool:
    if not _is_over(outcome_name, ''):
        # outcome id unknown here — check name
        if not (outcome_name or '').casefold().startswith('over'):
            return False
    if odds > MAX_LEG_ODDS or odds < 1.1:
        return False
    name = (market_name or '').casefold()
    if re.search(r'corner|shot|card|kick|tackle|half|home|away|competitor|1x2', name):
        return False
    line = _line(specifier, outcome_name)
    if line is None:
        return False
    if abs(line - 1.5) < 1e-6:
        return odds >= O15_FLOOR  # cheap O1.5 handled by switching to O2.5 elsewhere
    if abs(line - 2.5) < 1e-6:
        return True
    return False


def choose_over_line(o15_odds: float | None, o25_odds: float | None) -> float | None:
    """Return 1.5 or 2.5 depending on prices."""
    if o15_odds is not None and O15_FLOOR <= o15_odds <= MAX_LEG_ODDS:
        return 1.5
    if o15_odds is not None and o15_odds < O15_FLOOR and o25_odds is not None and 1.1 <= o25_odds <= MAX_LEG_ODDS:
        return 2.5
    if o15_odds is None and o25_odds is not None and 1.1 <= o25_odds <= MAX_LEG_ODDS:
        return 2.5
    return None


def keep_over15_pick(selection: ScoredSelection, rising_ok: bool, preferred_line: float | None) -> bool:
    if not rising_ok or preferred_line is None:
        return False
    if selection.odds > MAX_LEG_ODDS or selection.odds < 1.1:
        return False
    return is_goals_total_over(selection, preferred_line)


def apply_over15_ticket_filter(pool: list[ScoredSelection]) -> list[ScoredSelection]:
    """Keep one Over line per Aries-rising event under the price rules."""
    by_event: dict[str, list[ScoredSelection]] = {}
    for selection in pool:
        by_event.setdefault(selection.eventId, []).append(selection)

    kept: list[ScoredSelection] = []
    for event_id, selections in by_event.items():
        sample = selections[0]
        chart = cast_rising(sample.homeTeam, sample.kickoffAt)
        if not chart.eligible:
            continue
        o15 = next((s for s in selections if is_goals_total_over(s, 1.5)), None)
        o25 = next((s for s in selections if is_goals_total_over(s, 2.5)), None)
        line = choose_over_line(o15.odds if o15 else None, o25.odds if o25 else None)
        if line is None:
            continue
        pick = o15 if line == 1.5 else o25
        if pick and keep_over15_pick(pick, True, line):
            # Stamp Vedic confidence onto the pick for ranking
            prob = over15_probability(True) if line == 1.5 else over25_probability(True)
            kept.append(pick.model_copy(update={
                'probability': round(prob, 6),
                'confidence': round(prob * 100, 2),
                'modelVersion': f'vedic-o15-v1-{chart.sign.lower()}-{chart.degree:.0f}',
            }))
    return kept

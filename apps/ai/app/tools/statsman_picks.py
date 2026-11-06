"""Ticket pick rules when Statsman is the scoring engine.

Goals (O/U, BTTS): confidence ≥ 76%
1X2 side 58–65%: that team's "to score"
1X2 side ≥ 66%: that side's "1/over 2.5" or "win either half"
Corners / shots / shots on target: confidence ≥ 76%
Raw 1X2 is never ticketed — only the mapped markets above.
"""
from __future__ import annotations

import re

from app.llms.statsman import (
    COUNT_FLOOR,
    GOALS_FLOOR,
    STRONG_SIDE,
    TO_SCORE_HI,
    TO_SCORE_LO,
    Forecast,
    StatsmanModel,
)
from app.schemas import Market, ScoredSelection


def _name(selection: ScoredSelection) -> str:
    return ' '.join(f'{selection.marketName} {selection.selectionName}'.casefold().split())


def _is_goals_market(selection: ScoredSelection) -> bool:
    if selection.supportedMarket in (
        Market.OVER_1_5, Market.OVER_2_5, Market.UNDER_3_5, Market.BTTS_YES, Market.BTTS_NO,
    ):
        return True
    name = _name(selection)
    if re.search(r'corner|shot|card|kick|tackle|half|either|to score', name):
        return False
    return bool(re.search(r'over/under|total(?:\s+goals)?|both teams to score|btts', name))


def _is_count_market(selection: ScoredSelection) -> bool:
    name = _name(selection)
    return bool(re.search(r'\bcorners?\b|\bshots?\b', name))


def _is_to_score(selection: ScoredSelection, side: str) -> bool:
    name = _name(selection)
    if not re.search(r'to score|scores?\b|team score', name):
        return False
    if re.search(r'both|btts|\bgg\b', name):
        return False
    if side == 'home':
        return bool(re.search(r'\b(?:home|competitor1)\b', name)) and not re.search(r'\baway\b', name)
    return bool(re.search(r'\b(?:away|competitor2)\b', name)) and not re.search(r'\bhome\b', name)


def _is_side_or_over(selection: ScoredSelection, side: str) -> bool:
    name = _name(selection)
    if not re.search(r'\bor\b', name) or not re.search(r'over', name):
        return False
    if '2.5' not in name and 'total=2.5' not in (selection.specifier or ''):
        return False
    if re.search(r'half|under|corner|shot', name):
        return False
    if side == 'home':
        return bool(re.search(r'\b(?:home|competitor1)\b', name)) and not re.search(r'\baway\b', name)
    return bool(re.search(r'\b(?:away|competitor2)\b', name)) and not re.search(r'\bhome\b', name)


def _is_win_either_half(selection: ScoredSelection, side: str) -> bool:
    name = _name(selection)
    if not re.search(r'either half|win (?:a |one )?half', name):
        return False
    if side == 'home':
        return bool(re.search(r'\b(?:home|competitor1)\b', name))
    return bool(re.search(r'\b(?:away|competitor2)\b', name))


def _side_band(fc: Forecast) -> tuple[str | None, str]:
    """Return (side, band) where band is 'to_score' | 'strong' | None."""
    best_side, best_p = 'home', fc.ph
    if fc.pa > best_p:
        best_side, best_p = 'away', fc.pa
    pct = best_p * 100
    if TO_SCORE_LO <= pct <= TO_SCORE_HI:
        return best_side, 'to_score'
    if pct >= STRONG_SIDE:
        return best_side, 'strong'
    return None, ''


def statsman_market_allowed(market_id: str, market_name: str, specifier: str, outcome_name: str) -> bool:
    """Markets Statsman Mode may put on a ticket."""
    name = ' '.join(f'{market_name} {outcome_name}'.casefold().split())
    if re.search(r'player|handicap|exact number|excluded', name):
        return False
    if market_id == '1' or re.fullmatch(r'(?:1x2|match result|full time result)', ' '.join(market_name.casefold().split())):
        return False  # raw 1X2 never ticketed
    if re.search(r'to score|scores?\b', name) and not re.search(r'both|btts', name):
        return True
    if re.search(r'\bor\b', name) and re.search(r'over', name) and '2.5' in name:
        return True
    if re.search(r'either half|win (?:a |one )?half', name):
        return True
    if re.search(r'\bcorners?\b|\bshots?\b', name):
        return outcome_name.casefold().startswith(('over', 'under'))
    if re.search(r'over/under|total(?:\s+goals)?|both teams to score|btts', name):
        return True
    if market_id in ('18', '29', '166', '167', '168', '200', '201'):
        return True
    return False


def keep_statsman_pick(selection: ScoredSelection, forecast: Forecast) -> bool:
    """True when this scored outcome may enter a Statsman ticket."""
    if not forecast.covered:
        return False
    conf = selection.confidence
    side, band = _side_band(forecast)

    if _is_goals_market(selection):
        return conf >= GOALS_FLOOR

    if _is_count_market(selection):
        return conf >= COUNT_FLOOR

    if side and band == 'to_score' and _is_to_score(selection, side):
        return True

    if side and band == 'strong' and (
        _is_side_or_over(selection, side) or _is_win_either_half(selection, side)
    ):
        return True

    return False


def apply_statsman_ticket_filter(pool: list[ScoredSelection], model: StatsmanModel) -> list[ScoredSelection]:
    kept: list[ScoredSelection] = []
    for selection in pool:
        # Rebuild a minimal fixture-like object for forecast cache key
        class _F:
            eventId = selection.eventId
            homeTeam = selection.homeTeam
            awayTeam = selection.awayTeam
            league = selection.league

        forecast = model.forecast(_F())
        if keep_statsman_pick(selection, forecast):
            kept.append(selection)
    return kept

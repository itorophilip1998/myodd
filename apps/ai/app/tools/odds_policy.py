"""Shared odds floors and per-leg mode bands used by generation and filtering."""

import re

# Lowest accepted price for any single selection / game leg.
MIN_SELECTION_ODDS = 1.1

# Investor / Gambler: corners, shots/SOT, 1·over / 2·over may reach this ceiling.
INVESTOR_EXTENDED_LEG_ODDS_MAX = 1.45
# Match Over 1.5 goals — Investor/Gambler leg max (same band as Goals Desk direct O1.5).
O15_LEG_ODDS_MAX = 1.27

# Safe per-game / per-leg odds inside a ticket for named modes.
# Ticket totals still use risk_modes.MODES; these keep individual picks safer.
# Investor / Gambler default max is 1.35; see is_extended_leg_odds_market for 1.45.
MODE_SELECTION_ODDS = {
    'OVER15_MACHINE': (MIN_SELECTION_ODDS, 1.25),
    'GOALS_DESK_V2': (1.09, 1.60),  # 1.09 kept for O1.5→Asian O2 conversion
    'GGSP_V11': (1.09, 1.30),  # 1.09 kept for O1.5→Asian O2 conversion
    'INVESTOR': (MIN_SELECTION_ODDS, 1.35),
    'GAMBLER': (MIN_SELECTION_ODDS, 1.35),
    'JAPA': (MIN_SELECTION_ODDS, 2.0),
    'LAGOS_LIFE': (MIN_SELECTION_ODDS, 2.0),
}


def is_extended_leg_odds_market(market_name: str = '', outcome_name: str = '') -> bool:
    """Corners, shots/SOT, Home or Over 2.5, Away or Over 2.5 — leg max 1.45 on Investor/Gambler."""
    name = f'{market_name} {outcome_name}'.casefold()
    if re.search(r'\bcorners?\b', name):
        return True
    if re.search(r'\bshots?\b', name):
        return True
    if re.search(r'\bor\b', name) and re.search(r'\bover\b', name) and '2.5' in name and not re.search(r'\bdraw\b', name):
        return True
    return False


def is_match_goals_over_15(market_name: str = '', outcome_name: str = '') -> bool:
    """Match totals Over 1.5 — not team / club-titled goals, corners, shots, or 1·over."""
    market = ' '.join((market_name or '').casefold().split())
    outcome = ' '.join((outcome_name or '').casefold().split())
    if not outcome.startswith('over'):
        return False
    if not re.fullmatch(r'(?:over/?under|total(?:\s+goals)?)', market):
        return False
    match = re.search(r'(\d+(?:\.\d+)?)', outcome)
    return match is not None and abs(float(match.group(1)) - 1.5) < 1e-9


def selection_odds_bounds(mode: str | None, market_name: str = '', outcome_name: str = '') -> tuple[float, float | None]:
    if not mode:
        return MIN_SELECTION_ODDS, None
    low, high = MODE_SELECTION_ODDS.get(mode, (MIN_SELECTION_ODDS, None))
    if mode in ('INVESTOR', 'GAMBLER') and is_extended_leg_odds_market(market_name, outcome_name):
        high = INVESTOR_EXTENDED_LEG_ODDS_MAX
    if mode in ('INVESTOR', 'GAMBLER') and is_match_goals_over_15(market_name, outcome_name):
        high = O15_LEG_ODDS_MAX if high is None else min(high, O15_LEG_ODDS_MAX)
    return low, high


def within_mode_selection_odds(
    odds: float,
    mode: str | None,
    market_name: str = '',
    outcome_name: str = '',
) -> bool:
    if not isinstance(odds, (int, float)) or odds != odds:  # NaN guard
        return False
    low, high = selection_odds_bounds(mode, market_name, outcome_name)
    return odds >= low and (high is None or odds <= high)

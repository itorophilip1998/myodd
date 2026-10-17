"""Shared odds floors and per-leg mode bands used by generation and filtering."""

# Lowest accepted price for any single selection / game leg.
MIN_SELECTION_ODDS = 1.1

# Safe per-game / per-leg odds inside a ticket for named modes.
# Ticket totals still use risk_modes.MODES; these keep individual picks safer.
MODE_SELECTION_ODDS = {
    'INVESTOR': (MIN_SELECTION_ODDS, 1.5),
    'GAMBLER': (MIN_SELECTION_ODDS, 1.8),
    'JAPA': (MIN_SELECTION_ODDS, 2.0),
    'LAGOS_LIFE': (MIN_SELECTION_ODDS, 2.0),
}


def selection_odds_bounds(mode: str | None) -> tuple[float, float | None]:
    if not mode:
        return MIN_SELECTION_ODDS, None
    return MODE_SELECTION_ODDS.get(mode, (MIN_SELECTION_ODDS, None))


def within_mode_selection_odds(odds: float, mode: str | None) -> bool:
    if not isinstance(odds, (int, float)) or odds != odds:  # NaN guard
        return False
    low, high = selection_odds_bounds(mode)
    return odds >= low and (high is None or odds <= high)

"""Markets Investor Mode and Gambler Mode are allowed to use.

Exclusive list (no tackles / goal kicks) plus Statsman ticket markets
(BTTS, shots, team Over 0.5 / clean sheet, 1/over 2.5, win either half).
"""
import re

from app.tools.statsman_picks import removed_specialty_market, statsman_market_allowed


def investor_market_allowed(market_id: str, market_name: str, specifier: str, outcome_name: str) -> bool:
    """True for Investor/Gambler exclusive list or Statsman ticket markets."""
    if removed_specialty_market(market_id, market_name, outcome_name):
        return False
    if _investor_core_allowed(market_id, market_name, specifier, outcome_name):
        return True
    return statsman_market_allowed(market_id, market_name, specifier, outcome_name)


def _investor_core_allowed(market_id: str, market_name: str, specifier: str, outcome_name: str) -> bool:
    """True only for the shared Investor and Gambler market list."""
    name = ' '.join((market_name or '').casefold().split())
    outcome = ' '.join((outcome_name or '').casefold().split())
    market_id = str(market_id or '')
    if not name:
        return False
    if _double_chance(market_id, name):
        return True
    if _excluded_goals(name):
        return True
    if not (outcome.startswith('over') or outcome.startswith('under')):
        return False
    family = _family(name)
    if family is None:
        return False
    # Investor / Gambler: goals, corners, and cards Overs only — never Under.
    if family in {
        'goals', 'goals_home', 'goals_away',
        'corners', 'corners_home', 'corners_away',
        'cards', 'cards_home', 'cards_away',
    } and outcome.startswith('under'):
        return False
    if family in {'goals', 'corners', 'cards'}:
        return _side(name) == 'match'
    if family in {'goals_home', 'corners_home', 'cards_home'}:
        return _side(name) == 'home'
    if family in {'goals_away', 'corners_away', 'cards_away'}:
        return _side(name) == 'away'
    return False


def side_or_over_25(name: str, specifier: str, outcome: str) -> str | None:
    """Home, Away, or Draw or Over 2.5. The price wins if that result happens or the match clears 2.5 goals."""
    raw = f'{name} {outcome}'
    text = ' '.join(raw.casefold().split())
    if re.search(r'half|\bunder\b|corner|card|shot|kick|tackle', text):
        return None
    if outcome in {'no', 'ng'}:
        return None
    if not re.search(r'\bor\b', text) or not re.search(r'\bover\b', text):
        return None
    if _line(specifier, raw) != 2.5:
        return None
    home = bool(re.search(r'\b(?:home|competitor1)\b', text))
    away = bool(re.search(r'\b(?:away|competitor2)\b', text))
    draw = bool(re.search(r'\b(?:draw|x)\b', text))
    if home + away + draw != 1:
        return None
    if home:
        return 'home'
    if away:
        return 'away'
    return 'draw'


def _line(specifier: str, outcome: str) -> float | None:
    for part in (specifier or '').split('|'):
        if part.startswith('total='):
            try:
                return float(part.split('=', 1)[1])
            except ValueError:
                return None
    match = re.search(r'(\d+(?:\.\d+)?)', outcome)
    return float(match.group(1)) if match else None


def _side(name: str) -> str:
    if re.search(r'\b(away|competitor2)\b', name):
        return 'away'
    if re.search(r'\b(home|competitor1)\b', name):
        return 'home'
    if re.search(r'\bteam\b', name):
        return 'team'
    return 'match'


def _double_chance(market_id: str, name: str) -> bool:
    if 'half' in name or '&' in name or re.search(r'\band\b', name):
        return False
    return market_id == '10' or name == 'double chance'


def _excluded_goals(name: str) -> bool:
    if re.search(r'correct score|exact score|half|handicap|player', name):
        return False
    if not (re.search(r'excluded number of goals|exact number of goals|\bexact goals\b', name) or ('excluded' in name and 'goal' in name)):
        return False
    return _side(name) in {'match', 'home', 'away'}


def _family(name: str) -> str | None:
    if re.search(r'half|handicap|1x2|winner|player|shots?|\bor\b|&|\band\b', name):
        return None
    if 'goal kick' in name or 'goal-kick' in name or re.search(r'\btackles?\b', name):
        return None
    side = _side(name)
    if re.search(r'\bcorners?\b', name):
        return { 'match': 'corners', 'home': 'corners_home', 'away': 'corners_away' }.get(side)
    if re.search(r'\b(?:cards?|bookings?)\b', name):
        return { 'match': 'cards', 'home': 'cards_home', 'away': 'cards_away' }.get(side)
    if re.search(r'corner|card|booking|shot|kick|tackle', name):
        return None
    if side == 'match' and (re.search(r'over/under|total goals', name) or name in {'over/under', 'total'}):
        return 'goals'
    if side == 'home' and re.search(r'over/under|goals?|\btotal\b', name):
        return 'goals_home'
    if side == 'away' and re.search(r'over/under|goals?|\btotal\b', name):
        return 'goals_away'
    return None

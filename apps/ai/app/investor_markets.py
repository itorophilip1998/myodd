"""Markets Investor Mode is allowed to use. Every other market is dropped before search."""
import re

_GOAL_LINES = {'0.5', '1.5', '2.5', '3.5'}


def investor_market_allowed(market_id: str, market_name: str, specifier: str, outcome_name: str) -> bool:
    name = ' '.join((market_name or '').casefold().split())
    outcome = ' '.join((outcome_name or '').casefold().split())
    market_id = str(market_id or '')
    if not name:
        return False
    if _corners(name) or _shots(name) or _goal_kicks(name):
        return True
    if _player_to_score(name, outcome) or _lead_by_three(name, outcome) or _excluded_goals(name) or _win_either_half(name):
        return True
    if _htft(name) or _halftime_result(name):
        return True
    if _double_chance(market_id, name):
        return True
    if _total_goals(market_id, name, specifier, outcome):
        return True
    return _match_result(market_id, name)


def _yes_no(outcome: str) -> bool:
    return outcome in {'yes', 'no'}


def _totalish(name: str) -> bool:
    return bool(re.search(r'\b(total|over|under)\b|over/under', name))


def _line(specifier: str) -> str | None:
    for part in (specifier or '').split('|'):
        if part.startswith('total='):
            return part.split('=', 1)[1]
    return None


def _corners(name: str) -> bool:
    if 'corner' not in name or not _totalish(name):
        return False
    return not re.search(r'\b(1x2|winner|handicap|card|booking)\b', name)


def _shots(name: str) -> bool:
    if not re.search(r'\bshots?\b', name) or 'player' in name or not _totalish(name):
        return False
    return not re.search(r'\b(1x2|winner|handicap)\b', name)


def _goal_kicks(name: str) -> bool:
    if 'goal kick' not in name and 'goal-kick' not in name:
        return False
    return not re.search(r'\b(1x2|winner|handicap|card|booking)\b', name)


def _player_to_score(name: str, outcome: str) -> bool:
    if not _yes_no(outcome) or not re.search(r'\bto score\b', name):
        return False
    if re.search(r'\b(both teams|team|first|last|next|either|anytime)\b', name):
        return False
    return 'player' in name or not re.search(r'\b(home|away)\b', name)


def _lead_by_three(name: str, outcome: str) -> bool:
    if not _yes_no(outcome) or 'goal' not in name:
        return False
    return bool(re.search(r'\b3\b', name) and re.search(r'lead|row|consecutive', name))


def _win_either_half(name: str) -> bool:
    return 'win either half' in name and 'both halves' not in name


def _excluded_goals(name: str) -> bool:
    if re.search(r'excluded number of goals|exact number of goals|\bexact goals\b', name):
        return True
    return 'excluded' in name and 'goal' in name


def _htft(name: str) -> bool:
    return bool(re.search(r'ht\s*/\s*ft|half[\s-]*time\s*/\s*full[\s-]*time|halftime\s*/\s*fulltime', name)) and 'corner' not in name


def _halftime_result(name: str) -> bool:
    if re.search(r'corner|card|booking|shot|goal kick', name):
        return False
    return bool(re.search(r'((1st|first) half|half[\s-]*time).*(1x2|result)', name))


def _double_chance(market_id: str, name: str) -> bool:
    if 'half' in name or '&' in name or re.search(r'\band\b', name):
        return False
    return market_id == '10' or name == 'double chance'


def _total_goals(market_id: str, name: str, specifier: str, outcome: str) -> bool:
    if re.search(r'half|corner|card|booking|shot|kick|handicap', name):
        return False
    if not (outcome.startswith('over') or outcome.startswith('under')):
        return False
    if _line(specifier) not in _GOAL_LINES:
        return False
    return market_id == '18' or bool(re.search(r'over/under|total goals', name))


def _match_result(market_id: str, name: str) -> bool:
    if re.search(r'half|corner|card|booking|shot|minute|handicap', name):
        return False
    return market_id == '1' or name in {'1x2', 'match result'}

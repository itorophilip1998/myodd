"""Compact odds display tokens (k/m) and prompt parsing helpers."""
import math
import re

_SUFFIXES = ('', 'k', 'm', 'b', 't', 'q')
_PARSE_MULT = {
    '': 1.0,
    'k': 1e3,
    'ks': 1e3,
    'm': 1e6,
    'ms': 1e6,
    'b': 1e9,
    't': 1e12,
    'q': 1e15,
}
_TOKEN = re.compile(r'(\d+(?:\.\d+)?)\s*(ks?|ms?|b|t|q)?', re.I)


def format_odds(value: float) -> str:
    if not math.isfinite(value) or value < 0:
        return '—'
    if value < 1000:
        text = f'{value:.2f}'.rstrip('0').rstrip('.')
        return text or '0'
    if value >= 1e18:
        return f'{value:.1e}'.replace('.0e', 'e').replace('e+', 'e')
    unit = min(len(_SUFFIXES) - 1, int(math.floor(math.log10(value) / 3)))
    rounded = round(value / (1000 ** unit))
    if rounded == 1000 and unit < len(_SUFFIXES) - 1:
        unit += 1
        rounded = 1
    return f'{rounded}{_SUFFIXES[unit]}'


def parse_odds_token(raw: str) -> float | None:
    match = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(ks?|ms?|b|t|q)?\s*', str(raw), re.I)
    if not match:
        return None
    value = float(match[1])
    mult = _PARSE_MULT.get((match[2] or '').lower(), 1.0)
    parsed = value * mult
    return parsed if math.isfinite(parsed) and parsed > 0 else None


def odds_token_pattern() -> str:
    return r'(\d+(?:\.\d+)?\s*(?:ks?|ms?|b|t|q)?)'


def extract_odds_bounds(instruction: str) -> tuple[float | None, float | None]:
    """Parse ticket-odds floors/ceilings from natural language.

    Understands ``between 4 and 5``, ``4-5 odds``, ``only 4–5 odds``,
    ``not below 4``, ``at least 4 odds``, ``not above 5``, etc.
    """
    text = instruction
    token = odds_token_pattern()
    low: float | None = None
    high: float | None = None

    ranges = list(re.finditer(
        rf'(?:between\s+{token}\s*(?:and|to|-|–)\s*{token}|(?:only\s+)?{token}\s*[-–]\s*{token}\s*odds)',
        text, re.I))
    for match in ranges:
        # Skip "1-10 draws/minutes/games" style spans that are not odds bands.
        if re.match(r'\s*(?:minutes?|mins?|games?|matches?|legs?|draws?|picks?)\b', text[match.end():], re.I):
            continue
        groups = [g for g in match.groups() if g is not None]
        if len(groups) < 2:
            continue
        a, b = parse_odds_token(groups[-2]), parse_odds_token(groups[-1])
        if a is None or b is None:
            continue
        low, high = sorted((a, b))

    floor = re.search(
        rf'(?:not\s+(?:be?low|bellow|under|less\s+than)|(?:at\s+least|minimum|min)\s+(?:odds\s+)?){token}(?:\s*odds)?',
        text, re.I)
    if floor:
        value = parse_odds_token(floor[1])
        if value is not None:
            low = value if low is None else max(low, value)

    ceiling = re.search(
        rf'(?:not\s+(?:above|over|more\s+than|higher\s+than)|(?:at\s+most|maximum|max)\s+(?:odds\s+)?){token}(?:\s*odds)?',
        text, re.I)
    if ceiling:
        value = parse_odds_token(ceiling[1])
        if value is not None:
            high = value if high is None else min(high, value)

    around = list(re.finditer(rf'around\s+{token}', text, re.I))
    if around and low is None and high is None:
        value = parse_odds_token(around[-1][1])
        if value is not None:
            low, high = max(1.1, value * .8), value * 1.2

    return low, high


def extract_games_per_ticket(instruction: str) -> int | None:
    """Parse an exact games/picks-per-ticket count from natural language."""
    text = instruction.casefold()
    patterns = (
        r'(?:exactly\s+|make(?:\s+it)?\s+)(\d+)\s+(?:games?|matches?|picks?|legs?|selections?)\b',
        r'(\d+)\s+(?:games?|matches?|picks?|legs?|selections?)\s+(?:per\s+(?:ticket|slip|code)|each|on each)\b',
        r'(?:with|using)\s+(\d+)\s+(?:games?|matches?|picks?|legs?|selections?)\b',
        r'(?:games?|matches?|picks?|legs?|selections?)\s*[:=]\s*(\d+)\b',
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            count = int(match[1])
            if 1 <= count <= 50:
                return count
    return None


def has_explicit_odds_request(instruction: str) -> bool:
    low, high = extract_odds_bounds(instruction)
    if low is not None or high is not None:
        return True
    return bool(re.search(
        rf'\b(?:between|around|odds(?:\s+(?:of|above|below|over|under|from|at))?)\s+\d|\d(?:\.\d+)?\s*(?:ks?|ms?|b|t|q)?\s*odds',
        instruction, re.I))

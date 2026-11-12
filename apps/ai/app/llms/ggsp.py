"""GGSP v1.1 — Gematria Goal Signature Protocol (Chaldean Over 1.5).

CLEAN Select = digital roots 7–8 and tot ∉ {54,62}.
HARD league skip map from audit Mon 26 Oct → Wed 4 Nov 2026.

Team names are expanded through Flashscore aliases before the cipher so SportyBet
short forms (`Thun`, `Hearts`, `Pafos`) match the research-lock spellings.
"""
from __future__ import annotations

import re
import unicodedata

from app.llms.ggsp_aliases import expand_team_name
from app.llms.national_tournaments import is_national_team_tournament

SYSTEM_SHORT = 'GGSP'
VERSION = '1.1'
VERSION_LABEL = f'{SYSTEM_SHORT} v{VERSION} · Chaldean O1.5'

CHALDEAN = {
    'a': 1, 'i': 1, 'j': 1, 'q': 1, 'y': 1,
    'b': 2, 'k': 2, 'r': 2,
    'c': 3, 'g': 3, 'l': 3, 's': 3,
    'd': 4, 'm': 4, 't': 4,
    'e': 5, 'h': 5, 'n': 5, 'x': 5,
    'u': 6, 'v': 6, 'w': 6,
    'o': 7, 'z': 7,
    'f': 8, 'p': 8,
}
TOXIC_TOTALS = frozenset({54, 62})

HARD_SKIP_PATTERNS: tuple[str, ...] = (
    r'\bmontenegro\b',
    r'\b(north )?macedonia\b',
    r'\bbotola pro\b|\bmorocco\b.*\bbotola\b',
    r'\btanzania\b.*\b(ligi kuu|premier)\b|\bligi kuu bara\b',
    r'\buganda\b.*\bpremier\b',
    r'\bghana\b.*\b(premier|division one)\b',
    r'\balgeria\b.*\bligue 2\b',
    r'\btunisia\b.*\bligue 2\b',
    r'\bprimera nacional\b',
    r'\bprimera b metropolitana\b',
    r'\bliga alef\b',
    r'\bazadegan\b',
    r'\btercera (divisi[oó]n|división)\b|\btercera divisi',
    r'\bprimera divisi[oó]n rfef\b|\bprimera rfej?\b|\brfef - group\b',
    r'\bcopa del rey\b',
    r'\bserie d\b',
    r'\bcoppa italia serie d\b',
    r'\bcampionato primavera\b|\bprimavera -? ?2\b',
    r'\bnon league premier\b',
    r'\bnational league - (north|south)\b',
    r'\bistthmian\b|\bisthmian\b',
    r'\bsergipano\b',
    r'\bkuwait\b.*\b(division 1|div(?:ision)?\s*1)\b',
    r'\bqatar\b.*\b(second|division 2|2nd)\b|\bqatar 2\b',
    r'\bsaudi arabia\b.*\bdivision 2\b|\bksa\b.*\bdivision 2\b',
    r'\begypt\b.*\bleague cup\b',
    r'\buruguay\b.*\bsegunda\b',
    r'\becuador\b.*\b(serie b|liga pro serie b)\b',
    r'\bukraine\b.*\bu19\b',
)

SOFT_SKIP_PATTERNS: tuple[str, ...] = (
    r'\bportugal\b.*\bsegunda liga\b|\bsegunda liga\b',
    r'\bfrance\b.*\bligue 2\b|\bligue 2\b',
    r'\bpoland\b.*\bi liga\b|\bi liga\b',
    r'\bcolombia\b.*\bprimera a\b',
    r'\bchile\b.*\bprimera divisi',
    r'\bsaudi arabia\b.*\bdivision 1\b',
    r'\bserbia\b.*\bsuper liga\b',
    r'\b(united arab emirates|uae)\b.*\bu23\b|\bpro league u23\b',
    r'\bsyria\b.*\bpremier\b',
    r'\bcongo dr\b|\bdr congo\b',
    r'\bk3 league\b',
    r'\bwe league\b',
    r'\balbania\b.*\b(1st division|first division)\b',
    r'\bargentina\b.*\breserve\b',
    r'\btürkiye kupas|\bturkiye kupas|\bturkish cup\b',
)


def normalize(text: str) -> str:
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    return re.sub(r'[^a-z]', '', text)


def chaldean_total(text: str) -> int:
    return sum(CHALDEAN.get(c, 0) for c in normalize(text))


def digital_root(n: int) -> int:
    while n > 9:
        n = sum(int(d) for d in str(n))
    return n


def classify_combo(home: str, away: str, *, expand: bool = True) -> tuple[int, int, str]:
    """Classify home+away. Default expands SportyBet labels to Flashscore spellings."""
    if expand:
        home = expand_team_name(home)
        away = expand_team_name(away)
    tot = chaldean_total(home + away)
    root = digital_root(tot)
    if root <= 4:
        return tot, root, 'AVOID_1_4'
    if root == 5:
        return tot, root, 'ROOT5'
    if root == 6:
        return tot, root, 'ROOT6'
    if root == 9 or tot in TOXIC_TOTALS:
        return tot, root, 'CAUTION_7_9'
    if root in (7, 8):
        return tot, root, 'CLEAN_7_8'
    return tot, root, 'OTHER'


def _blob(country: str = '', competition: str = '') -> str:
    """Same blob shape as football-simulator: country/category + competition/league."""
    return f'{country or ""} {competition or ""}'.lower()


def is_hard_skip_league(country: str = '', competition: str = '') -> bool:
    # Country HARD skips target weak domestic books — not senior national tournaments.
    if is_national_team_tournament(competition, country):
        return False
    blob = _blob(country, competition)
    return any(re.search(p, blob) for p in HARD_SKIP_PATTERNS)


def is_soft_skip_league(country: str = '', competition: str = '') -> bool:
    if is_national_team_tournament(competition, country):
        return False
    if is_hard_skip_league(country, competition):
        return False
    blob = _blob(country, competition)
    return any(re.search(p, blob) for p in SOFT_SKIP_PATTERNS)


def is_clean_select(
    home: str,
    away: str,
    league: str = '',
    *,
    category: str = '',
    allow_soft: bool = False,
) -> bool:
    """True when fixture is CLEAN 7–8 and passes the v1.1 league gate.

    Prefer passing SportyBet categoryName as `category` and tournament name as `league`
    so country-dependent HARD/SOFT patterns match football-simulator.
    National-team tournaments always clear the league gate (cipher still applies).
    """
    _, _, tier = classify_combo(home, away)
    if tier != 'CLEAN_7_8':
        return False
    if is_hard_skip_league(category, league):
        return False
    if not allow_soft and is_soft_skip_league(category, league):
        return False
    return True

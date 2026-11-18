"""Senior competition hygiene for Over 1.5 / Goals Desk / GGSP.

Cipher and chart gates alone admit youth, FA Trophy, Tercera, Diski, etc.
This shared deny-list drops those before tickets are built. Used by pick filters
and the Flashscore-first bridge.

Africa: only Egypt first division + South Africa first division are allowed.
Nov 2026 Aries O1.5 miss autopsy — soft pads, Czech 3rd/4th/KP, Germany
Oberliga/Regionalliga, Italy Serie C/D, Croatia Druga NL, Montenegro Druga Liga,
USL Championship (men; not Super League Women).
"""
from __future__ import annotations

import re

from app.llms.national_tournaments import is_friendly

# League / category blob — weak comps that pad odds bands.
WEAK_COMP_PATTERNS: tuple[str, ...] = (
    # Youth / reserves
    r'\b(?:u17|u18|u19|u20|u21|u22|u23)\b',
    r'\byouth\b',
    r'\bunder[-\s]?\d+\b',
    r'\bprimavera\b',
    r'\bdiski\b',
    r'\bnext pro\b',
    r'\breserve\b|\breserves\b',
    r'\bmls next\b',
    # England non-league / cups that kill O1.5 books
    r'\bfa trophy\b',
    r'\bsouthern league\b',
    r'\bnorthern premier\b',
    r'\bist(?:hm)?ian\b',
    r'\bnon[-\s]?league\b',
    r'\bnational league\s*[-–]?\s*(north|south)\b',
    # Lower / amateur abroad (Turkish 3. Lig / J3 still allowed)
    r'\btercera\b',
    r'\bprimera\s+rfe[fj]?\b|\brfef\s*[-–]?\s*group\b',
    r'\btweede\s+divisie\b',
    r'\bderde\s+divisie\b',
    r'\bliga\s+premier\b',
    r'\bprimera\s+premier\b',
    # Czech 3rd / 4th + regional KP (not Chance Liga / FNL)
    r'\bczech(?:\s+republic)?\b.*\b(?:3\.?\s*cfl|msfl|3\.?\s*liga|4\.?\s*liga|\bkp\b)',
    r'\b(?:3\.?\s*cfl|msfl)\b',
    # Germany Oberliga / Regionalliga — 50% Aries month
    r'\boberliga\b',
    r'\bregionalliga\b',
    # Italy Serie C / D
    r'\bserie\s+[cd]\b',
    # Balkans thin — Croatia Druga NL + Montenegro Druga Liga only
    r'\bdruga\s+nl\b',
    r'\bmontenegro\b.*\bdruga\s+liga\b|\bdruga\s+liga\b.*\bmontenegro\b',
    # USA USL Championship (men) — keep USL Super League Women
    r'\busl\s+championship\b',
    # Friendlies / exhibition
    r'\bclub\s+friendly\b',
    r'\bballer\b',
)

# Team-name signals when the league label is vague.
WEAK_TEAM_PATTERNS: tuple[str, ...] = (
    r'\b(?:u17|u18|u19|u20|u21|u22|u23)\b',
    r'\byouth\b',
    r'\bunder[-\s]?\d+\b',
    r'\breserves?\b',
    r'\bdiski\b',
)

# Domestic Africa + continental CAF/AFCON labels (Flashscore ZA country / AFRICA:).
# Egypt + South Africa first divisions are allow-listed separately.
_AFRICAN_COUNTRY_RE = re.compile(
    r'\b(?:'
    r'algeria|angola|benin|botswana|burkina(?:\s+faso)?|burundi|cameroon|'
    r'cape\s+verde|cabo\s+verde|central\s+african|chad|comoros|'
    r'(?:dr\s*)?congo|c[oô]te\s+d[\'’]?ivoire|ivory\s+coast|djibouti|egypt|'
    r'equatorial\s+guinea|eritrea|eswatini|swaziland|ethiopia|gabon|gambia|'
    r'ghana|guinea(?:[-\s]bissau)?|kenya|lesotho|liberia|libya|madagascar|'
    r'malawi|mali|mauritania|mauritius|morocco|mozambique|namibia|niger|'
    r'nigeria|rwanda|senegal|seychelles|sierra\s+leone|somalia|south\s+africa|'
    r'south\s+sudan|sudan|tanzania|togo|tunisia|uganda|zambia|zimbabwe|'
    r's[aã]o\s+tom[eé]'
    r')\b',
    re.I,
)
_AFRICA_CONTINENTAL_RE = re.compile(r'(?:^|[\s:])africa\b', re.I)

# Only these African first divisions stay playable.
_EGYPT_FIRST_RE = re.compile(
    r'\begypt\b.*\b(?:premier(?:\s+league)?|egyptian\s+premier)\b',
    re.I,
)
_SOUTH_AFRICA_FIRST_RE = re.compile(
    r'\bsouth\s+africa\b.*\b(?:premiership|premier\s+soccer(?:\s+league)?|betway)\b',
    re.I,
)


def _is_allowed_africa_first_division(league_blob: str) -> bool:
    """Egypt Premier / South Africa Premiership only (not Div 2 / Diski / cups)."""
    if _EGYPT_FIRST_RE.search(league_blob):
        # Exclude Egypt lower flights that still say premier-ish noise
        if re.search(r'\bdivision\s*2\b|\bligue\s*2\b|\bsecond\b', league_blob):
            return False
        return True
    if _SOUTH_AFRICA_FIRST_RE.search(league_blob):
        if re.search(r'\bdiski\b|\bchampionship\b|\bnational\s+first\b', league_blob):
            return False
        return True
    return False


def _is_african_pad(league_blob: str) -> bool:
    """True for African domestic/continental comps outside the Egypt/SA 1st allow-list."""
    if _is_allowed_africa_first_division(league_blob):
        return False
    if _AFRICA_CONTINENTAL_RE.search(league_blob):
        return True
    return bool(_AFRICAN_COUNTRY_RE.search(league_blob))


def _team_weak(name: str) -> bool:
    text = (name or '').casefold().strip()
    if not text:
        return False
    return any(re.search(p, text) for p in WEAK_TEAM_PATTERNS)


def is_weak_competition(
    league: str = '',
    category: str = '',
    *,
    home: str = '',
    away: str = '',
) -> bool:
    """True when the fixture is youth / reserve / non-league / lower amateur / friendly."""
    league_blob = f'{category or ""} {league or ""}'.casefold()
    if is_friendly(league_blob):
        return True
    if _is_african_pad(league_blob):
        return True
    if any(re.search(p, league_blob) for p in WEAK_COMP_PATTERNS):
        return True
    if _team_weak(home) or _team_weak(away):
        return True
    return False


def passes_senior_hygiene(
    league: str = '',
    category: str = '',
    *,
    home: str = '',
    away: str = '',
) -> bool:
    return not is_weak_competition(league, category, home=home, away=away)

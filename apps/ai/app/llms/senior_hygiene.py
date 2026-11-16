"""Senior competition hygiene for Over 1.5 / Goals Desk / GGSP.

Cipher and chart gates alone admit youth, FA Trophy, Tercera, Diski, etc.
This shared deny-list drops those before tickets are built. Used by pick filters
and the Flashscore-first bridge.

Allowed: women, Turkish 3. Lig, German Oberliga, J3, Regionalliga, El Salvador.
Sun 15 autopsy — block only the soft African pads that died thin: Kenya,
Senegal, Cameroon, Tunisia Ligue 2.
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
    # Lower / amateur abroad (not Oberliga / Turkish 3. Lig / Regionalliga / J3)
    r'\btercera\b',
    r'\bprimera\s+rfe[fj]?\b|\brfef\s*[-–]?\s*group\b',
    r'\btweede\s+divisie\b',
    r'\bderde\s+divisie\b',
    r'\bliga\s+premier\b',
    r'\bprimera\s+premier\b',
    # Soft African pads — Sun 15 Vedic thin 0–0 / 1–0 cluster
    r'\bkenya\b',
    r'\bsenegal\b',
    r'\bcameroon\b',
    r'\btunisia\b.*\bligue\s*2\b|\bligue\s*2\b.*\btunisia\b',
    # Friendlies / exhibition
    r'\bclub\s+friendly\b',
    r'\bballer\b',
)

# Team-name signals when the league label is vague.
# Keep narrow — do not match senior "Liverpool FC" / "Athletic Club".
# Women sides are allowed (no WFC / trailing-W / "women" markers).
WEAK_TEAM_PATTERNS: tuple[str, ...] = (
    r'\b(?:u17|u18|u19|u20|u21|u22|u23)\b',
    r'\byouth\b',
    r'\bunder[-\s]?\d+\b',
    r'\breserves?\b',
    r'\bdiski\b',
)


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

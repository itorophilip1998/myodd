"""Senior national-team tournament detection (shared by Statsman, GGSP, FS modes).

Friendlies, youth (U17–U23), and club UEFA comps are out of scope.
"""
from __future__ import annotations

import re


def _league_text(league: str) -> str:
    text = re.sub(r'[-–_/|]', ' ', (league or '').casefold())
    return ' '.join(text.split())


def is_friendly(league: str) -> bool:
    text = _league_text(league)
    return bool(re.search(r'\bfriendl|\binternational\s+friendl|\bfriendly\s+match', text))


def is_national_team_tournament(league: str, category: str = '') -> bool:
    """True for senior country tournaments + qualifiers (not friendlies / youth / club UEFA)."""
    text = _league_text(f'{category} {league}')
    if not text or is_friendly(text):
        return False
    if re.search(r'\b(?:u17|u18|u19|u20|u21|u23|youth|under[-\s]?\d+)\b', text):
        return False
    if re.search(
        r'champions\s+league|europa\s+league|conference\s+league|club\s+world|'
        r'\bucl\b|\buel\b|\buecl\b',
        text,
    ):
        return False
    return bool(re.search(
        r'world\s*cup|'
        r'\buefa\s+euro\b|\beuropean\s+championship\b|\beuros?\b|'
        r'copa\s+am[eé]rica|'
        r'africa(?:n)?\s+cup(?:\s+of\s+nations)?|\bafcon\b|'
        r'asian\s+cup|'
        r'gold\s+cup|'
        r'nations?\s+league|'
        r'olympics?|\bolympic\s+(?:games|football|soccer)|'
        r'arab\s+cup|'
        r'ofc\s+nations|oceania\s+nations|'
        r'\baff\b|\bsaff\b|\bcecafa\b|\bcosafa\b|\bgulf\s+cup|\bkings?\s+cup|'
        r'\bwcq\b|'
        r'(?:world|euro|copa|africa|asian|nations?).{0,24}qualif|'
        r'qualif.{0,24}(?:world|euro|copa|africa|asian|nations?)',
        text,
    ))

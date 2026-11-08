"""SportyBet → Flashscore team-name expansions for GGSP cipher parity.

Chaldean totals are spelling-sensitive. The research lock grades Flashscore names
(`FC Thun`, `Heart Of Midlothian`, `FK Crvena Zvezda`, …). SportyBet often shortens
or translates those (`Thun`, `Hearts`, `Red Star Belgrade`), which flips CLEAN → AVOID.

Values are Flashscore spellings. Keys are accent-stripped lowercased lookup forms.
Add a row whenever a CLEAN Flashscore fixture is missing on SportyBet names.
"""
from __future__ import annotations

import re
import unicodedata

# lookup_key → Flashscore display name used for the cipher
TEAM_ALIASES: dict[str, str] = {
    # UEFA / nicknames (2026-11-05 board + common SportyBet forms)
    'thun': 'FC Thun',
    'fc thun': 'FC Thun',
    'hearts': 'Heart Of Midlothian',
    'heart of midlothian': 'Heart Of Midlothian',
    'heart of midlothian fc': 'Heart Of Midlothian',
    'red star belgrade': 'FK Crvena Zvezda',
    'red star': 'FK Crvena Zvezda',
    'crvena zvezda': 'FK Crvena Zvezda',
    'fk crvena zvezda': 'FK Crvena Zvezda',
    'inter escaldes': "Inter Club d'Escaldes",
    "inter club d'escaldes": "Inter Club d'Escaldes",
    'lincoln red imps': 'Lincoln Red Imps FC',
    'lincoln red imps fc': 'Lincoln Red Imps FC',
    'hajduk split': 'HNK Hajduk Split',
    'hnk hajduk split': 'HNK Hajduk Split',
    'pafos': 'Paphos',
    'paphos': 'Paphos',
    'pafos fc': 'Paphos',
    'riga fc': 'Riga',
    'riga': 'Riga',
    'jablonec': 'FK Jablonec',
    'fk jablonec': 'FK Jablonec',
    'sparta prague': 'Sparta Praha',
    'sparta praha': 'Sparta Praha',
    # Research lock: Bayer Leverkusen + Marseille = 80/8 (not bare Leverkusen / Olympique Marseille)
    'leverkusen': 'Bayer Leverkusen',
    'bayer 04 leverkusen': 'Bayer Leverkusen',
    'bayer leverkusen': 'Bayer Leverkusen',
    'olympique marseille': 'Marseille',
    'olympique de marseille': 'Marseille',
    'marseille': 'Marseille',
    # Anderlecht + Red Bull Salzburg = 89/8 — short "Salzburg" / "RB Salzburg" flip CLEAN
    'salzburg': 'Red Bull Salzburg',
    'rb salzburg': 'Red Bull Salzburg',
    'red bull salzburg': 'Red Bull Salzburg',
    'fc red bull salzburg': 'Red Bull Salzburg',
    'rsc anderlecht': 'Anderlecht',
    'anderlecht': 'Anderlecht',
    # NEC Nijmegen + Omonia Nicosia = 88/7
    'nec': 'NEC Nijmegen',
    'n e c': 'NEC Nijmegen',
    'nec nijmegen': 'NEC Nijmegen',
    'omonia': 'Omonia Nicosia',
    'omonia nicosia': 'Omonia Nicosia',
    'jagiellonia bialystok': 'Jagiellonia',
    'jagiellonia': 'Jagiellonia',
    'dinamo zagreb': 'Dinamo Zagreb',
    'gnk dinamo zagreb': 'Dinamo Zagreb',
    'hapoel beer sheva': 'Hapoel Beer Sheva',
    "hapoel be'er sheva": 'Hapoel Beer Sheva',
    'ofi crete': 'OFI',
    'ofi': 'OFI',
    # Twente + Paphos = 61/7 — "FC Twente" flips to 72/9
    'twente': 'Twente',
    'fc twente': 'Twente',
}


def alias_key(name: str) -> str:
    text = unicodedata.normalize('NFKD', name or '')
    text = ''.join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r'[^a-z0-9 ]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def expand_team_name(name: str) -> str:
    """Map a SportyBet (or other) team label to the Flashscore cipher spelling when known."""
    key = alias_key(name)
    if not key:
        return name or ''
    return TEAM_ALIASES.get(key, name)

"""Vedic Over 1.5 Machine — Lahiri whole-sign rising filter.

Eligible games: lagna sign == Aries (kickoff chart at the home ground).
Uncovered stadiums use a deterministic lat/lon hash so the cast stays prematch-only.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone

SIGNS = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

# Over 1.5 Machine rising sign — Aries lagna at kickoff.
O15_RISING_SIGN = os.getenv('OVER15_RISING_SIGN', 'Aries')

# Optional known grounds (home team → lat, lon)
STADIUMS: dict[str, tuple[float, float]] = {
    'newcastle': (54.9756, -1.6217),
    'manchester utd': (53.4631, -2.2913),
    'manchester united': (53.4631, -2.2913),
    'arsenal': (51.5549, -0.1084),
    'chelsea': (51.4816, -0.1909),
    'liverpool': (53.4308, -2.9608),
    'tottenham': (51.6043, -0.0664),
    'barcelona': (41.3809, 2.1228),
    'real madrid': (40.4530, -3.6883),
    'atl. madrid': (40.4362, -3.5995),
    'bayern munich': (48.2188, 11.6247),
    'dortmund': (51.4926, 7.4519),
    'psg': (48.8414, 2.2530),
    'paris sg': (48.8414, 2.2530),
    'inter': (45.4781, 9.1240),
    'ac milan': (45.4781, 9.1240),
    'milan': (45.4781, 9.1240),
    'juventus': (45.1096, 7.6413),
    'roma': (41.9341, 12.4547),
    'as roma': (41.9341, 12.4547),
    'napoli': (40.8522, 14.3050),
    'ajax': (52.3142, 4.9419),
    'feyenoord': (51.8939, 4.5232),
    'benfica': (38.7527, -9.1847),
    'porto': (41.1618, -8.5839),
    'sporting cp': (38.7612, -9.1607),
}


def _canon(name: str) -> str:
    return ' '.join(name.casefold().split())


def coords_for(home: str) -> tuple[float, float, str]:
    key = _canon(home)
    if key in STADIUMS:
        return (*STADIUMS[key], 'known')
    # Deterministic salt — same home name always same chart seed
    digest = hashlib.sha256(key.encode()).digest()
    lat = (digest[0] / 255.0) * 140.0 - 60.0
    lon = (int.from_bytes(digest[1:3], 'big') / 65535.0) * 360.0 - 180.0
    return (round(lat, 4), round(lon, 4), 'hash')


@dataclass(frozen=True)
class RisingChart:
    sign: str
    degree: float
    lat: float
    lon: float
    coord_src: str
    eligible: bool


def _as_utc(kickoff: datetime | str) -> datetime:
    if isinstance(kickoff, str):
        raw = kickoff.strip().replace('Z', '+00:00')
        kickoff = datetime.fromisoformat(raw)
    if kickoff.tzinfo is None:
        return kickoff.replace(tzinfo=timezone.utc)
    return kickoff.astimezone(timezone.utc)


def rising_at(kickoff: datetime | str, lat: float, lon: float) -> tuple[str, float]:
    import swisseph as swe

    swe.set_sid_mode(swe.SIDM_LAHIRI)
    utc = _as_utc(kickoff)
    ut = utc.hour + utc.minute / 60.0 + utc.second / 3600.0
    jd = swe.julday(utc.year, utc.month, utc.day, ut)
    _, ascmc = swe.houses_ex(jd, lat, lon, b'W', swe.FLG_SIDEREAL)
    asc = ascmc[0] % 360
    sign = SIGNS[int(asc // 30)]
    return sign, float(asc % 30)


def cast_rising(home: str, kickoff: datetime | str) -> RisingChart:
    lat, lon, src = coords_for(home)
    try:
        sign, degree = rising_at(kickoff, lat, lon)
    except Exception:
        return RisingChart(sign='?', degree=0.0, lat=lat, lon=lon, coord_src=src, eligible=False)
    return RisingChart(
        sign=sign,
        degree=degree,
        lat=lat,
        lon=lon,
        coord_src=src,
        eligible=sign == O15_RISING_SIGN,
    )


def over15_probability(eligible: bool) -> float:
    """Ranking confidence for Over 1.5 on an eligible rising chart."""
    return 0.90 if eligible else 0.40


def over25_probability(eligible: bool) -> float:
    """Weaker than O1.5 — used only when O1.5 is priced under 1.11."""
    return 0.62 if eligible else 0.45

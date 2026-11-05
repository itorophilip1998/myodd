"""Flashscore football day feed — discovery source for Over 1.5 / Goals Desk / GGSP.

SportyBet names and listing coverage lag Flashscore. These three modes grade on the
Flashscore slate first, then match SportyBet markets onto that board.
"""
from __future__ import annotations

import logging
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache

logger = logging.getLogger(__name__)

FS_TEMPLATE = 'https://global.flashscore.ninja/2/x/feed/f_1_{offset}_3_en_1'
FS_HEADERS = {
    'User-Agent': 'Mozilla/5.0',
    'X-Fsign': 'SW9D1eZo',
    'Referer': 'https://www.flashscore.com/',
}
# Prematch + live + finished codes on the daily board
_STATUS = {'1': 'NS', '2': 'Live', '3': 'FT'}


@dataclass(frozen=True)
class FlashscoreFixture:
    home: str
    away: str
    league: str
    kickoff_at: datetime  # aware UTC
    status: str
    ab: str


def _fetch_raw(offset: int, timeout: float = 45.0) -> str:
    url = FS_TEMPLATE.format(offset=offset)
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(url, headers=FS_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
        return response.read().decode('utf-8', 'replace')


@lru_cache(maxsize=16)
def _cached_day(offset: int, bucket: str) -> tuple[FlashscoreFixture, ...]:
    """Cache one day of fixtures for a few minutes (bucket = floored UTC minute/5)."""
    del bucket  # only for cache key churn
    try:
        raw = _fetch_raw(offset)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning('Flashscore feed offset=%s failed: %s', offset, exc)
        return ()
    return tuple(_parse_feed(raw))


def _parse_feed(raw: str) -> list[FlashscoreFixture]:
    current_league: str | None = None
    out: list[FlashscoreFixture] = []
    for part in raw.split('~'):
        fields: dict[str, str] = {}
        for field in part.split('¬'):
            if '÷' in field:
                key, value = field.split('÷', 1)
                fields[key] = value
        if part.startswith('ZA') and 'ZA' in fields:
            current_league = fields['ZA']
            continue
        if not current_league:
            continue
        ab = fields.get('AB')
        if ab not in _STATUS:
            continue
        home, away = fields.get('AE'), fields.get('AF')
        ts = int(fields.get('AD') or fields.get('AA') or 0)
        if not home or not away or not ts:
            continue
        kickoff = datetime.fromtimestamp(ts, tz=timezone.utc)
        out.append(FlashscoreFixture(
            home=home.strip(),
            away=away.strip(),
            league=current_league.strip(),
            kickoff_at=kickoff,
            status=_STATUS[ab],
            ab=ab,
        ))
    # Stable unique by home/away/kickoff
    seen: set[tuple[str, str, int]] = set()
    unique: list[FlashscoreFixture] = []
    for fixture in out:
        key = (fixture.home, fixture.away, int(fixture.kickoff_at.timestamp()))
        if key in seen:
            continue
        seen.add(key)
        unique.append(fixture)
    unique.sort(key=lambda f: (f.kickoff_at, f.league, f.home))
    return unique


def day_offsets_covering(kickoff_after: datetime, kickoff_before: datetime, *, now: datetime | None = None) -> list[int]:
    """Flashscore day index relative to today (0=today, 1=tomorrow, -1=yesterday)."""
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(timezone.utc).date()
    start = kickoff_after.astimezone(timezone.utc).date()
    # kickoff_before is exclusive end — last included calendar day is the day before
    end_exclusive = kickoff_before.astimezone(timezone.utc).date()
    end = end_exclusive - timedelta(days=1)
    if end < start:
        end = start
    offsets: list[int] = []
    day = start
    while day <= end:
        offsets.append((day - today).days)
        day += timedelta(days=1)
    # Cap to a week either side of today (feed only publishes nearby days)
    return [o for o in offsets if -1 <= o <= 6]


def fetch_flashscore_window(
    kickoff_after: datetime | None,
    kickoff_before: datetime | None,
    *,
    now: datetime | None = None,
) -> list[FlashscoreFixture]:
    """Load Flashscore football fixtures overlapping the kickoff window."""
    now = now or datetime.now(timezone.utc)
    after = kickoff_after or now
    before = kickoff_before or (now + timedelta(days=1))
    if after.tzinfo is None:
        after = after.replace(tzinfo=timezone.utc)
    if before.tzinfo is None:
        before = before.replace(tzinfo=timezone.utc)
    bucket = now.strftime('%Y%m%d%H') + str(now.minute // 5)
    fixtures: list[FlashscoreFixture] = []
    for offset in day_offsets_covering(after, before, now=now):
        fixtures.extend(_cached_day(offset, bucket))
    return [
        fixture for fixture in fixtures
        if after <= fixture.kickoff_at < before and fixture.ab in ('1', '2')
    ]


def clear_flashscore_cache() -> None:
    _cached_day.cache_clear()

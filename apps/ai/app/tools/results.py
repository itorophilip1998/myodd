"""Fetch and cache recent completed football results for trend scoring."""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import httpx
from app.memory.cache import trend_cache as _CACHE

_DAYS = 30


def parse_bbc_results(html: str, day: str) -> list[dict]:
    script = re.search(r'window\.__INITIAL_DATA__\s*=\s*("(?:[^"\\]|\\.)*")\s*;', html)
    if not script:
        return []
    state = json.loads(json.loads(script.group(1)))
    rows = []
    for key, value in (state.get('data') or {}).items():
        if not str(key).startswith('sport-data-scores-fixtures?'):
            continue
        data = (value or {}).get('data') or {}
        if data.get('sport') != 'football' or data.get('selectedStartDate') != day:
            continue
        for group in data.get('eventGroups') or []:
            for secondary in group.get('secondaryGroups') or []:
                for event in secondary.get('events') or []:
                    parsed = _finished(event)
                    if parsed:
                        rows.append(parsed)
    return rows


def _finished(event: dict) -> dict | None:
    if event.get('status') != 'PostEvent':
        return None
    period = (event.get('periodLabel') or {}).get('value')
    if period not in {'FT', 'AET', 'PENS'}:
        return None
    home, away = event.get('home') or {}, event.get('away') or {}
    scores = (
        (home.get('runningScores') or {}).get('fulltime'),
        (away.get('runningScores') or {}).get('fulltime'),
    )
    if not all(re.fullmatch(r'(?:0|[1-9]\d?)', str(score or '')) for score in scores):
        return None
    if not home.get('fullName') or not away.get('fullName') or not event.get('startDateTime'):
        return None
    return {
        'home': home['fullName'], 'away': away['fullName'], 'kickoff': event['startDateTime'],
        'homeGoals': int(scores[0]), 'awayGoals': int(scores[1]),
    }


def load_recent_matches(days: int = _DAYS, today: date | None = None, fetch=None) -> list[dict]:
    now = time.time()
    if fetch is None and now - _CACHE['at'] < _CACHE['ttl']:
        return _CACHE['rows']
    start = today or date.today()
    loader = fetch or _fetch_day
    dates = [(start - timedelta(days=offset)).isoformat() for offset in range(1, days + 1)]

    def one(day: str) -> list[dict]:
        try:
            return loader(day)
        except Exception:
            return []

    rows: list[dict] = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for batch in pool.map(one, dates):
            rows.extend(batch)
    if fetch is None:
        _CACHE['at'] = now
        _CACHE['rows'] = rows
        _CACHE['ttl'] = 6 * 60 * 60 if rows else 10 * 60
    return rows


def _fetch_day(day: str) -> list[dict]:
    response = httpx.get(
        f'https://www.bbc.co.uk/sport/football/scores-fixtures/{day}',
        headers={'Accept': 'text/html', 'User-Agent': 'myOdd/0.2 (team trend)'},
        timeout=8,
        follow_redirects=True,
    )
    if response.status_code != 200 or len(response.text) > 3_000_000:
        return []
    return parse_bbc_results(response.text, day)


async def recent_matches(runtime):
    """Read immediately; refresh history off the request path, at most once per worker."""
    import asyncio
    now = time.time()
    pending = getattr(runtime, 'trend_refresh', None)
    if now - _CACHE['at'] >= _CACHE['ttl'] and (pending is None or pending.done()):
        pending = asyncio.create_task(asyncio.to_thread(load_recent_matches))
        runtime.trend_refresh = pending

        def completed(task):
            if not task.cancelled():
                task.exception()  # Consume refresh errors; requests retain their numerical base model.
        pending.add_done_callback(completed)
    return _CACHE['rows'] if now - _CACHE['at'] < 24 * 60 * 60 else []

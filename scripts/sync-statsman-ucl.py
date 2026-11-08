#!/usr/bin/env python3
"""Build apps/ai/data/statsman/ucl.csv from openfootball seasons + ESPN finished games."""
from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__import__('os').environ.get('STATSMAN_DATA_DIR', ROOT / 'apps/ai/data/statsman'))
OUT = OUT_DIR / 'ucl.csv'
OPENFOOTBALL = [
    'https://raw.githubusercontent.com/openfootball/champions-league/master/2024-25/cl.txt',
    'https://raw.githubusercontent.com/openfootball/champions-league/master/2025-26/cl.txt',
]
ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates='

DATE_RE = re.compile(
    r'^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+'
    r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s+(\d{4}))?\s*$'
)
MATCH_RE = re.compile(
    r'^\s*(?:\d{1,2}:\d{2}\s+)?(.+?)\s+v\s+(.+?)\s+(\d+)\s*-\s*(\d+)\b',
    re.I,
)
MONTH = {m: i for i, m in enumerate(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
COUNTRY = re.compile(r'\s*\([A-Z]{3}\)\s*$')


def curl_json(url: str) -> dict | list | None:
    try:
        raw = subprocess.check_output(
            ['curl', '-sS', '-L', '-m', '25', '-A', 'Mozilla/5.0', '-H', 'Accept: application/json', url],
            stderr=subprocess.DEVNULL,
        )
        return json.loads(raw)
    except Exception:
        return None


def curl_text(url: str) -> str:
    try:
        return subprocess.check_output(
            ['curl', '-sS', '-L', '-m', '30', '-A', 'Mozilla/5.0', url],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        return ''


def strip_club(name: str) -> str:
    return COUNTRY.sub('', name).strip()


def parse_openfootball(text: str) -> list[dict]:
    rows: list[dict] = []
    year = None
    month = day = None
    for line in text.splitlines():
        dm = DATE_RE.match(line)
        if dm:
            month = MONTH[dm.group(1)]
            day = int(dm.group(2))
            if dm.group(3):
                year = int(dm.group(3))
            continue
        if year is None or month is None or day is None:
            continue
        mm = MATCH_RE.match(line)
        if not mm:
            continue
        # openfootball omits the year on mid-season lines; keep last explicit year
        try:
            d = datetime(year, month, day)
        except ValueError:
            continue
        rows.append({
            'Date': d.strftime('%d/%m/%Y'),
            'HomeTeam': strip_club(mm.group(1)),
            'AwayTeam': strip_club(mm.group(2)),
            'FTHG': int(mm.group(3)),
            'FTAG': int(mm.group(4)),
            'Source': 'openfootball',
        })
    return rows


def parse_espn_window(start: date, end: date) -> list[dict]:
    rows: list[dict] = []
    day = start
    while day <= end:
        stamp = day
        data = curl_json(ESPN + stamp.strftime('%Y%m%d'))
        day += timedelta(days=1)
        if not isinstance(data, dict):
            continue
        for event in data.get('events') or []:
            comp = (event.get('competitions') or [{}])[0]
            status = (comp.get('status') or {}).get('type') or {}
            done = bool(status.get('completed')) or 'final' in (status.get('description') or '').lower()
            if not done and status.get('name') not in ('STATUS_FINAL', 'STATUS_FULL_TIME'):
                continue
            home = away = None
            hs = as_ = None
            for team in comp.get('competitors') or []:
                label = (team.get('team') or {}).get('displayName') or (team.get('team') or {}).get('shortDisplayName')
                if team.get('homeAway') == 'home':
                    home, hs = label, team.get('score')
                else:
                    away, as_ = label, team.get('score')
            if home is None or away is None or hs in (None, '') or as_ in (None, ''):
                continue
            raw_date = (event.get('date') or '')[:10]
            try:
                match_day = datetime.strptime(raw_date, '%Y-%m-%d')
            except ValueError:
                match_day = datetime(stamp.year, stamp.month, stamp.day)
            rows.append({
                'Date': match_day.strftime('%d/%m/%Y'),
                'HomeTeam': home,
                'AwayTeam': away,
                'FTHG': int(hs),
                'FTAG': int(as_),
                'Source': 'espn',
            })
    return rows


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    for url in OPENFOOTBALL:
        text = curl_text(url)
        part = parse_openfootball(text)
        print(f'openfootball {url.rsplit("/", 2)[-2]}: {len(part)} matches', file=sys.stderr)
        rows.extend(part)
    today = date.today()
    # Current CL season window only (Aug → today). Openfootball covers prior seasons.
    espn_start = date(today.year if today.month >= 8 else today.year - 1, 8, 15)
    espn = parse_espn_window(espn_start, today)
    print(f'espn finished: {len(espn)} matches', file=sys.stderr)
    rows.extend(espn)
    # de-dupe by date+teams
    seen: set[tuple[str, str, str]] = set()
    unique: list[dict] = []
    for row in rows:
        key = (row['Date'], row['HomeTeam'].casefold(), row['AwayTeam'].casefold())
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    with OUT.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'Source'])
        writer.writeheader()
        writer.writerows(sorted(unique, key=lambda r: datetime.strptime(r['Date'], '%d/%m/%Y')))
    print(f'wrote {OUT} ({len(unique)} rows)', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

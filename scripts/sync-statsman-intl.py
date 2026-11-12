#!/usr/bin/env python3
"""Build apps/ai/data/statsman/intl.csv from openfootball national-team tournaments.

Covers World Cup / Euro / Copa / AFCON / Asian Cup / Gold Cup / Nations Leagues /
qualifiers / related senior tournaments. Skips friendlies. Years ≥ 2021 by default.
"""
from __future__ import annotations

import csv
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(os.environ.get('STATSMAN_DATA_DIR', ROOT / 'apps/ai/data/statsman'))
OUT = OUT_DIR / 'intl.csv'
TREE_URL = 'https://api.github.com/repos/openfootball/internationals/git/trees/master?recursive=1'
RAW = 'https://raw.githubusercontent.com/openfootball/internationals/master/'
MIN_YEAR = int(os.environ.get('STATSMAN_INTL_MIN_YEAR', '2021'))

DATE_RE = re.compile(
    r'^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+'
    r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s+(\d{4}))?\s*$'
)
MATCH_RE = re.compile(
    r'^\s{1,}(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+?)(?:\s+@\s+.+)?\s*$'
)
HEADER_YEAR_RE = re.compile(r'=\s*.+\s+(19|20)\d{2}\s*$')
MONTH = {m: i for i, m in enumerate(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
YEAR_IN_PATH = re.compile(r'(?:^|/)((?:19|20)\d{2})_')


def curl_bytes(url: str, timeout: int = 45) -> bytes:
    return subprocess.check_output(
        ['curl', '-sS', '-L', '-m', str(timeout), '-A', 'Mozilla/5.0', url],
        stderr=subprocess.DEVNULL,
    )


def curl_text(url: str, timeout: int = 45) -> str:
    try:
        return curl_bytes(url, timeout).decode('utf-8', 'replace')
    except Exception:
        return ''


def curl_json(url: str) -> dict | list | None:
    try:
        return json.loads(curl_bytes(url))
    except Exception:
        return None


def path_year(path: str) -> int | None:
    match = YEAR_IN_PATH.search(path)
    return int(match.group(1)) if match else None


def intl_paths(tree: dict) -> list[str]:
    out: list[str] = []
    for node in tree.get('tree') or []:
        if node.get('type') != 'blob':
            continue
        path = node.get('path') or ''
        if not path.endswith('.txt'):
            continue
        low = path.casefold()
        if 'friendly' in low:
            continue
        year = path_year(path)
        if year is None or year < MIN_YEAR:
            continue
        out.append(path)
    return sorted(out)


def parse_intl_text(text: str, default_year: int | None = None) -> list[dict]:
    rows: list[dict] = []
    year = default_year
    month = day = None
    for line in text.splitlines():
        header = HEADER_YEAR_RE.match(line.strip())
        if header and year is None:
            try:
                year = int(line.strip()[-4:])
            except ValueError:
                pass
            continue
        dm = DATE_RE.match(line.strip())
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
        home, away = mm.group(1).strip(), mm.group(4).strip()
        if not home or not away:
            continue
        try:
            d = datetime(year, month, day)
            hs, as_ = int(mm.group(2)), int(mm.group(3))
        except ValueError:
            continue
        rows.append({
            'Date': d.strftime('%d/%m/%Y'),
            'HomeTeam': home,
            'AwayTeam': away,
            'FTHG': hs,
            'FTAG': as_,
            'Source': 'openfootball-intl',
        })
    return rows


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tree = curl_json(TREE_URL)
    if not isinstance(tree, dict):
        print('failed to load openfootball internationals tree', file=sys.stderr)
        return 1
    paths = intl_paths(tree)
    print(f'intl files ≥{MIN_YEAR} (no friendlies): {len(paths)}', file=sys.stderr)
    rows: list[dict] = []
    for path in paths:
        year = path_year(path)
        text = curl_text(RAW + path)
        if not text:
            print(f'  skip empty {path}', file=sys.stderr)
            continue
        part = parse_intl_text(text, default_year=year)
        print(f'  {path}: {len(part)} matches', file=sys.stderr)
        rows.extend(part)

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
    return 0 if unique else 1


if __name__ == '__main__':
    raise SystemExit(main())

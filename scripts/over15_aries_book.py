#!/usr/bin/env python3
"""One-shot: Vedic Aries Over 1.5 Machine → SportyBet share codes."""
from __future__ import annotations

import json
import math
import random
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

SSL_CTX = ssl.create_default_context()
try:
    import certifi
    SSL_CTX.load_verify_locations(certifi.where())
except Exception:
    SSL_CTX.check_hostname = False
    SSL_CTX.verify_mode = ssl.CERT_NONE

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/ai'))

from app.llms.vedic_o15 import cast_rising  # noqa: E402
from app.tools.over15_picks import choose_over_line  # noqa: E402

REGION = 'ng'
BASE = 'https://www.sportybet.com'
LAGOS = ZoneInfo('Africa/Lagos')
MAX_LEG = 1.25
TARGET, LO, HI = 3.0, 1.9, 3.15  # prefer ~3.0; ~2.0 allowed when short
TICKETS = 5


def http_json(method: str, path: str, body: dict | None = None) -> dict:
    url = f'{BASE}{path}'
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Current-Country': REGION.upper(),
            'User-Agent': 'Mozilla/5.0 (compatible; myOdd/0.1; +https://github.com/myodd)',
        },
    )
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as res:
        payload = json.loads(res.read().decode())
    if payload.get('bizCode') not in (None, 10000):
        raise RuntimeError(payload.get('message') or f'bizCode {payload.get("bizCode")}')
    return payload.get('data') or payload


def fetch_fixtures(day: datetime | None = None, horizon_hours: int = 36) -> list[dict]:
    """Upcoming fixtures in the next `horizon_hours` (default 36h slate)."""
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=horizon_hours)
    hours = max(24, min(168, horizon_hours + 6))
    if day is not None:
        start = day.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=LAGOS).astimezone(timezone.utc)
        end = start + timedelta(days=1)
        now_floor = now
        hours = max(24, min(168, math.ceil((end - now).total_seconds() / 3600) + 6))
    else:
        start = now
        now_floor = now
    events: list[dict] = []
    for page in range(1, 21):
        path = (
            f'/api/{REGION}/factsCenter/pcUpcomingEvents'
            f'?sportId=sr:sport:1&marketId=18&pageSize=100&pageNum={page}'
            f'&todayGames=false&timeline={hours}&_t={int(time.time()*1000)}'
        )
        data = http_json('GET', path)
        tours = data.get('tournaments') or []
        n = 0
        for tour in tours:
            league = tour.get('name') or ''
            for ev in tour.get('events') or []:
                n += 1
                kick_ms = ev.get('estimateStartTime') or 0
                kick = datetime.fromtimestamp(kick_ms / 1000, tz=timezone.utc)
                if kick < now_floor or kick < start or kick >= end:
                    continue
                status = str(ev.get('matchStatus') or '').lower()
                if status and status not in ('not start', 'not started', '0'):
                    continue
                events.append({**ev, 'league': league, 'kickoffAt': kick})
        if n < 100:
            break
        time.sleep(0.3)
    return events


def over_legs(event: dict) -> dict[float, dict]:
    out: dict[float, dict] = {}
    for market in event.get('markets') or []:
        if str(market.get('id')) != '18':
            continue
        name = (market.get('desc') or '').lower()
        if any(x in name for x in ('corner', 'shot', 'card', 'kick', 'tackle', 'half', 'home', 'away', 'competitor')):
            continue
        spec = market.get('specifier') or ''
        line = None
        for part in spec.split('|'):
            if part.startswith('total='):
                try:
                    line = float(part.split('=', 1)[1])
                except ValueError:
                    line = None
        for outcome in market.get('outcomes') or []:
            desc = (outcome.get('desc') or '').strip()
            if not desc.lower().startswith('over'):
                continue
            try:
                odds = float(outcome.get('odds'))
            except (TypeError, ValueError):
                continue
            if not (1.1 <= odds <= MAX_LEG):
                continue
            got = line
            if got is None:
                import re
                m = re.search(r'(\d+(?:\.\d+)?)', desc)
                got = float(m.group(1)) if m else None
            if got not in (1.5, 2.5):
                continue
            if got == 1.5 and odds < 1.11:
                continue  # switch handled later via choose_over_line
            out[got] = {
                'eventId': event['eventId'],
                'marketId': str(market['id']),
                'outcomeId': str(outcome['id']),
                'specifier': spec,
                'odds': odds,
                'home': event.get('homeTeamName'),
                'away': event.get('awayTeamName'),
                'league': event.get('league'),
                'kickoffAt': event['kickoffAt'].isoformat(),
                'line': got,
                'selectionName': desc,
                'marketName': market.get('desc') or 'Over/Under',
            }
    # Also keep cheap O1.5 so choose_over_line can switch
    for market in event.get('markets') or []:
        if str(market.get('id')) != '18':
            continue
        spec = market.get('specifier') or ''
        line = None
        for part in spec.split('|'):
            if part.startswith('total='):
                try:
                    line = float(part.split('=', 1)[1])
                except ValueError:
                    line = None
        if line != 1.5:
            continue
        for outcome in market.get('outcomes') or []:
            desc = (outcome.get('desc') or '').strip()
            if not desc.lower().startswith('over'):
                continue
            try:
                odds = float(outcome.get('odds'))
            except (TypeError, ValueError):
                continue
            if odds < 1.11:
                out['_o15_raw'] = odds  # type: ignore
            break
    return out


def eligible_picks(events: list[dict]) -> list[dict]:
    picks = []
    for ev in events:
        chart = cast_rising(ev.get('homeTeamName') or '', ev['kickoffAt'])
        if not chart.eligible:
            continue
        legs = over_legs(ev)
        o15 = legs.get(1.5)
        o25 = legs.get(2.5)
        o15_odds = o15['odds'] if o15 else None
        if o15_odds is None:
            raw = legs.get('_o15_raw')
            o15_odds = raw if isinstance(raw, float) else None
        if o15_odds is None:
            for market in ev.get('markets') or []:
                if str(market.get('id')) != '18':
                    continue
                if 'total=1.5' not in (market.get('specifier') or ''):
                    continue
                for outcome in market.get('outcomes') or []:
                    if not (outcome.get('desc') or '').lower().startswith('over'):
                        continue
                    try:
                        o15_odds = float(outcome['odds'])
                    except (TypeError, ValueError, KeyError):
                        o15_odds = None
                    break
        line = choose_over_line(o15_odds, o25['odds'] if o25 else None)
        if line is None:
            continue
        pick = o15 if line == 1.5 else o25
        if not pick:
            continue
        picks.append({**pick, 'rising': chart.sign, 'degree': chart.degree, 'coord': chart.coord_src})
    picks.sort(key=lambda p: (abs(p['odds'] - 1.18), p['home'] or ''))
    return picks


def build_tickets(pool: list[dict], count: int = TICKETS) -> list[list[dict]]:
    rng = random.Random(int(time.time()) // 60)
    remaining = list(pool)
    tickets: list[list[dict]] = []
    used = set()
    for _ in range(count):
        candidates = [p for p in remaining if p['eventId'] not in used]
        if not candidates:
            break
        # Prefer ~3 legs of ~1.14–1.18 → ~3.0
        best = None
        best_score = 1e9
        for n in range(3, 8):
            if len(candidates) < n:
                break
            sample = candidates[: min(40, len(candidates))]
            # greedy product toward target
            chosen: list[dict] = []
            prod = 1.0
            for pick in sorted(sample, key=lambda p: abs(math.log(p['odds']) - math.log(TARGET) / n)):
                if pick['eventId'] in {c['eventId'] for c in chosen}:
                    continue
                nxt = prod * pick['odds']
                if nxt > HI and chosen:
                    continue
                chosen.append(pick)
                prod = nxt
                if len(chosen) >= n and LO <= prod <= HI:
                    break
                if len(chosen) >= n:
                    break
            if len(chosen) < 2:
                continue
            prod = math.prod(c['odds'] for c in chosen)
            if not (LO <= prod <= HI):
                # trim or skip
                while len(chosen) > 2 and prod > HI:
                    chosen.pop()
                    prod = math.prod(c['odds'] for c in chosen)
                if not (LO <= prod <= HI):
                    continue
            score = abs(prod - TARGET) + rng.random() * 0.01
            if score < best_score:
                best_score = score
                best = chosen
        if not best:
            break
        tickets.append(best)
        for p in best:
            used.add(p['eventId'])
            remaining = [x for x in remaining if x['eventId'] != p['eventId']]
    return tickets


def book(ticket: list[dict]) -> dict:
    payload = {
        'selections': [
            {
                'eventId': p['eventId'],
                'marketId': p['marketId'],
                'specifier': p['specifier'],
                'outcomeId': p['outcomeId'],
            }
            for p in ticket
        ]
    }
    return http_json('POST', f'/api/{REGION}/orders/share', payload)


def main() -> int:
    day = None
    horizon = 36
    for arg in sys.argv[1:]:
        if arg.startswith('h='):
            horizon = int(arg.split('=', 1)[1])
        else:
            day = datetime.strptime(arg, '%Y-%m-%d').replace(tzinfo=LAGOS)
    label = day.date().isoformat() if day else f'next {horizon}h'
    print(f'Window {label} · Aries rising · Over 1.5 Machine', flush=True)
    events = fetch_fixtures(day, horizon_hours=horizon)
    print(f'Listed games in window: {len(events)}', flush=True)
    picks = eligible_picks(events)
    print(f'Aries-eligible Over legs: {len(picks)}', flush=True)
    for p in picks[:12]:
        print(f"  {p['home']} vs {p['away']} · Over {p['line']} @{p['odds']} · {p['rising']} {p['degree']:.0f}°", flush=True)
    tickets = build_tickets(picks)
    if not tickets:
        print('No tickets near 3.0 could be built.', flush=True)
        return 1
    codes = []
    for i, ticket in enumerate(tickets, 1):
        total = math.prod(p['odds'] for p in ticket)
        print(f'\nTicket {i} · {total:.2f}x · {len(ticket)} legs', flush=True)
        for p in ticket:
            print(f"  - {p['home']} vs {p['away']} · Over {p['line']} @{p['odds']}", flush=True)
        try:
            booked = book(ticket)
            code = booked.get('shareCode') or booked.get('shareURL') or '?'
            codes.append((code, total, ticket))
            print(f'  CODE: {code}', flush=True)
        except Exception as exc:
            print(f'  BOOK FAILED: {exc}', flush=True)
        time.sleep(0.4)
    print('\n=== Sporty codes ===', flush=True)
    for code, total, ticket in codes:
        print(f'{code}  ({total:.2f}x, {len(ticket)} legs)', flush=True)
    out = Path('/tmp/over15_aries_codes.json')
    out.write_text(json.dumps([
        {'code': c, 'odds': t, 'legs': [
            {'home': p['home'], 'away': p['away'], 'line': p['line'], 'odds': p['odds'], 'eventId': p['eventId']}
            for p in legs
        ]} for c, t, legs in codes
    ], indent=2))
    print(f'Wrote {out}', flush=True)
    return 0 if codes else 2


if __name__ == '__main__':
    raise SystemExit(main())

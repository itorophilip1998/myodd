"""Recent finished-score trends for Investor and Gambler goal markets.

Corners, cards, shots, tackles, and goal kicks are not scored here. The results
feed only has full-time goals, so those markets are left out of the trend pool.
"""
import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import httpx

from .investor_markets import side_or_over_25
from .schemas import ScoredSelection

TREND_VERSION = 'trend-bbc-v1'
_CACHE: dict = {'at': 0.0, 'rows': [], 'ttl': 0.0}
_DAYS = 30
_MIN_MATCHES = 5


def _norm(value: str) -> str:
    value = value.casefold()
    value = re.sub(r'[^a-z0-9]+', ' ', value)
    return re.sub(r'\s+', ' ', value).strip()


def market_kind(name: str, outcome: str = '', specifier: str = '') -> str | None:
    side = side_or_over_25(name, specifier, outcome)
    if side:
        return f'{side}_or_over'
    text = _norm(name)
    if any(word in text for word in ('half', 'corner', 'card', 'booking', 'shot', 'tackle', 'kick', 'handicap')):
        return None
    if text == 'double chance' or text.startswith('double chance '):
        return 'double'
    if ('exact' in text and 'goal' in text) or ('excluded' in text and 'goal' in text):
        if re.search(r'\bhome\b', text):
            return 'excluded_home'
        if re.search(r'\baway\b', text):
            return 'excluded_away'
        return 'excluded'
    side = 'home' if re.search(r'\bhome\b', text) else 'away' if re.search(r'\baway\b', text) else None
    if text in {'over under', 'total', 'total goals'} or 'total goals' in text:
        return f'{side}_goals' if side else 'match_goals'
    if side and ('goal' in text or 'over under' in text or 'total' in text):
        return f'{side}_goals'
    if 'goal' in text and any(word in text for word in ('over', 'under', 'total')):
        return 'match_goals'
    return None


def _line(specifier: str | None, outcome: str) -> float | None:
    match = re.search(r'total=([0-9]+(?:\.[0-9]+)?)', specifier or '')
    if match:
        return float(match.group(1))
    match = re.search(r'([0-9]+(?:\.[0-9]+)?)', outcome)
    return float(match.group(1)) if match else None


def _double(outcome: str) -> str | None:
    text = re.sub(r'[^a-z0-9]+', '', outcome.casefold())
    if text in {'1x', 'homedraw', 'homeordraw', '1orx'}:
        return '1x'
    if text in {'x2', 'awaydraw', 'draworaway', 'xor2', 'drawaway'}:
        return 'x2'
    if text in {'12', 'homeaway', 'homeoraway', '1or2'}:
        return '12'
    return None


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


def _poisson(lam: float, limit: int = 11) -> list[float]:
    lam = min(4.5, max(0.15, lam))
    raw = [math.exp(-lam)]
    for k in range(1, limit):
        raw.append(raw[-1] * lam / k)
    raw[-1] += max(0.0, 1 - sum(raw))
    return raw


def _rates(rows: list[dict]) -> tuple[float, float] | None:
    if len(rows) < _MIN_MATCHES:
        return None
    scored = sum(row['gf'] for row in rows) / len(rows)
    conceded = sum(row['ga'] for row in rows) / len(rows)
    recent, older = rows[:3], rows[3:]
    if len(older) >= 3:
        delta = (sum(row['gf'] for row in recent) / len(recent)) - (sum(row['gf'] for row in older) / len(older))
        scored *= 1 + max(-0.15, min(0.15, delta / 2))
    return max(0.15, scored), max(0.15, conceded)


class TeamIndex:
    def __init__(self, matches: list[dict]):
        self.teams: dict[str, list[dict]] = {}
        ordered = sorted(matches, key=lambda row: row['kickoff'], reverse=True)
        for row in ordered:
            self.teams.setdefault(_norm(row['home']), []).append({'gf': row['homeGoals'], 'ga': row['awayGoals'], 'home': True})
            self.teams.setdefault(_norm(row['away']), []).append({'gf': row['awayGoals'], 'ga': row['homeGoals'], 'home': False})

    def _team(self, name: str) -> list[dict] | None:
        key = _norm(name)
        if key in self.teams:
            return self.teams[key]
        for candidate, rows in self.teams.items():
            if len(key) >= 6 and len(candidate) >= 6 and (key in candidate or candidate in key):
                return rows
        return None

    def expected(self, home: str, away: str) -> tuple[float, float] | None:
        home_rows, away_rows = self._team(home), self._team(away)
        if not home_rows or not away_rows:
            return None
        home_venue = [row for row in home_rows if row['home']]
        away_venue = [row for row in away_rows if not row['home']]
        home_rates = _rates(home_venue if len(home_venue) >= _MIN_MATCHES else home_rows)
        away_rates = _rates(away_venue if len(away_venue) >= _MIN_MATCHES else away_rows)
        if not home_rates or not away_rates:
            return None
        return (home_rates[0] + away_rates[1]) / 2, (away_rates[0] + home_rates[1]) / 2


def trend_probability(kind: str, specifier: str | None, outcome: str, home_xg: float, away_xg: float) -> float | None:
    home, away = _poisson(home_xg), _poisson(away_xg)
    if kind in {'home_or_over', 'away_or_over', 'draw_or_over'}:
        return _result_or_over(home, away, kind.split('_', 1)[0])
    if kind == 'double':
        side = _double(outcome)
        if side is None:
            return None
        win = draw = loss = 0.0
        for h, ph in enumerate(home):
            for a, pa in enumerate(away):
                p = ph * pa
                if h > a:
                    win += p
                elif h == a:
                    draw += p
                else:
                    loss += p
        return {'1x': win + draw, 'x2': loss + draw, '12': win + loss}[side]
    if kind == 'match_goals':
        total = [0.0] * (len(home) + len(away) - 1)
        for h, ph in enumerate(home):
            for a, pa in enumerate(away):
                total[h + a] += ph * pa
        return _goals_outcome(total, specifier, outcome)
    if kind == 'home_goals':
        return _goals_outcome(home, specifier, outcome)
    if kind == 'away_goals':
        return _goals_outcome(away, specifier, outcome)
    if kind == 'excluded':
        return _excluded(home, away, outcome, 'match')
    if kind == 'excluded_home':
        return _excluded(home, away, outcome, 'home')
    if kind == 'excluded_away':
        return _excluded(home, away, outcome, 'away')
    return None


def _result_or_over(home: list[float], away: list[float], side: str) -> float:
    probability = 0.0
    for h, ph in enumerate(home):
        for a, pa in enumerate(away):
            won = h > a if side == 'home' else a > h if side == 'away' else h == a
            if won or h + a > 2.5:
                probability += ph * pa
    return probability


def _goals_outcome(dist: list[float], specifier: str | None, outcome: str) -> float | None:
    text = outcome.casefold().strip()
    line = _line(specifier, outcome)
    if line is None:
        return None
    if text.startswith('over'):
        return sum(p for k, p in enumerate(dist) if k > line)
    if text.startswith('under'):
        return sum(p for k, p in enumerate(dist) if k < line)
    return None


def _excluded(home: list[float], away: list[float], outcome: str, side: str) -> float | None:
    match = re.search(r'\d+', outcome)
    if not match:
        return None
    target = int(match.group())
    if side == 'home':
        return 1 - home[target] if target < len(home) else 1.0
    if side == 'away':
        return 1 - away[target] if target < len(away) else 1.0
    total = [0.0] * (len(home) + len(away) - 1)
    for h, ph in enumerate(home):
        for a, pa in enumerate(away):
            total[h + a] += ph * pa
    return 1 - total[target] if target < len(total) else 1.0


def apply_match_trends(pool: list[ScoredSelection], matches: list[dict]) -> tuple[list[ScoredSelection], str]:
    if not matches:
        return pool, 'Recent scores were unavailable, so these picks used bookmaker prices.'
    index = TeamIndex(matches)
    trend: list[ScoredSelection] = []
    priced: list[ScoredSelection] = []
    for selection in pool:
        kind = market_kind(selection.marketName, selection.selectionName, selection.specifier)
        if kind is None:
            continue
        expected = index.expected(selection.homeTeam, selection.awayTeam)
        if expected is None:
            priced.append(selection)
            continue
        probability = trend_probability(kind, selection.specifier, selection.selectionName, *expected)
        if probability is None or not math.isfinite(probability):
            priced.append(selection)
            continue
        probability = min(0.99, max(0.01, probability))
        trend.append(selection.model_copy(update={
            'probability': probability,
            'confidence': round(probability * 100, 2),
            'modelVersion': TREND_VERSION,
        }))
    if trend and len({row.eventId for row in trend}) >= 2:
        return trend, (
            'Goal, team-goal, excluded-goal, double-chance, and Home, Draw, or Away or Over 2.5 picks were ranked from recent finished scores. '
            'Corners, cards, shots, tackles, and goal kicks were left out because those stats are not in the results feed.'
        )
    if trend:
        return trend + priced, (
            'Some teams had no recent finished scores, so those goal picks used bookmaker prices. '
            'Corners, cards, shots, tackles, and goal kicks were left out.'
        )
    if priced:
        return priced, (
            'Recent scores did not match these teams, so goal picks used bookmaker prices. '
            'Corners, cards, shots, tackles, and goal kicks were left out.'
        )
    return [], 'Recent scores did not support any of the shared Investor and Gambler markets.'


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

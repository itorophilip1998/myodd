"""Statsman shop engine — Elo 1X2 + decayed attack/defence for goals, corners, shots, SOT,
cards; fouls→tackles and shots-faced→goal kicks proxies; Poisson exact/excluded goals.

Confidence is the model probability × 100 for the SportyBet outcome being priced.
Train files live under STATSMAN_DATA_DIR (football-data.co.uk CSVs).
"""
from __future__ import annotations

import csv
import math
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

HA = 40.0
HALF_LIFE = 21.0
SHRINK = 8.0
GOALS_FLOOR = 76.0
COUNT_FLOOR = 76.0
EXACT_FLOOR = 42.0  # Exact / excluded goals — higher than old 30% so they do not flood tickets
TO_SCORE_LO = 58.0
TO_SCORE_HI = 65.0
STRONG_SIDE = 66.0
# 1·over / 2·over map floor (WEH only needs strong side; team O0.5 only needs to-score band).
STRONG_MAP_FLOOR = 70.0
# Team Over 1.5: favourite win ≥70% (side only — no extra map floor).
TEAM_O15_SIDE = 70.0
# Sporty 2UP (team to win / early payout): favourite win ≥80%.
TWO_UP_SIDE = 80.0

# Display league / path fragment → CSV filename under data dir (full match stats).
LEAGUE_FILES = {
    'premier league': 'E0.csv',
    'championship': 'E1.csv',
    'league one': 'E2.csv',
    'league two': 'E3.csv',
    'laliga': 'SP1.csv',
    'la liga': 'SP1.csv',
    'laliga2': 'SP2.csv',
    'la liga 2': 'SP2.csv',
    'serie a': 'I1.csv',
    'serie b': 'I2.csv',
    'bundesliga': 'D1.csv',
    '2. bundesliga': 'D2.csv',
    'ligue 1': 'F1.csv',
    'ligue 2': 'F2.csv',
    'eredivisie': 'N1.csv',
    'liga portugal': 'P1.csv',
    'jupiler': 'B1.csv',
    'pro league': 'B1.csv',
    'süper lig': 'T1.csv',
    'super lig': 'T1.csv',
    'premiership': 'SC0.csv',
}

# football-data.co.uk/new/ — results + odds only (goals Elo strong; corners/shots/cards use priors).
# value = (csv filename, League column filter)
NEW_LEAGUE_FILES = {
    'denmark superliga': ('DNK.csv', 'Superliga'),
    'superligaen': ('DNK.csv', 'Superliga'),
    'allsvenskan': ('SWE.csv', 'Allsvenskan'),
    'eliteserien': ('NOR.csv', 'Eliteserien'),
    'mls': ('USA.csv', 'MLS'),
    'major league soccer': ('USA.csv', 'MLS'),
    'brazil serie a': ('BRA.csv', 'Serie A'),
    'brasileirao': ('BRA.csv', 'Serie A'),
    'ekstraklasa': ('POL.csv', 'Ekstraklasa'),
    'romania superliga': ('ROU.csv', 'Superliga'),
    'liga 1 romania': ('ROU.csv', 'Superliga'),
}

ALL_LEAGUE_FILES = {
    **LEAGUE_FILES,
    **{key: filename for key, (filename, _) in NEW_LEAGUE_FILES.items()},
}

TEAM_ALIASES = {
    'man utd': 'man united',
    'manchester utd': 'man united',
    'manchester united': 'man united',
    'manchester city': 'man city',
    'nottingham': "nott'm forest",
    'nottingham forest': "nott'm forest",
    'atl. madrid': 'ath madrid',
    'atletico madrid': 'ath madrid',
    'atlético madrid': 'ath madrid',
    'sporting cp': 'sp lisbon',
    'psg': 'paris sg',
    'paris saint germain': 'paris sg',
    'as roma': 'roma',
    'ac milan': 'milan',
    'inter milan': 'inter',
    'bayern munich': 'bayern munich',
    'b. monchengladbach': "m'gladbach",
    'borussia monchengladbach': "m'gladbach",
    'sheffield utd': 'sheffield united',
    'sheffield wednesday': 'sheffield weds',
    'west bromwich albion': 'west brom',
    'west brom': 'west brom',
    'wolverhampton': 'wolves',
    'wolverhampton wanderers': 'wolves',
    'brighton': 'brighton',
    'brighton & hove albion': 'brighton',
    'tottenham': 'tottenham',
    'tottenham hotspur': 'tottenham',
    'newcastle utd': 'newcastle',
    'newcastle united': 'newcastle',
    # SportyBet full names → football-data short names (EFL / PL)
    'blackburn rovers': 'blackburn',
    'stoke city': 'stoke',
    'charlton athletic': 'charlton',
    'bolton wanderers': 'bolton',
    'derby county': 'derby',
    'portsmouth fc': 'portsmouth',
    'swansea city': 'swansea',
    'preston north end': 'preston',
    'queens park rangers': 'qpr',
    'birmingham city': 'birmingham',
    'bristol city': 'bristol city',
    'cardiff city': 'cardiff',
    'norwich city': 'norwich',
    'ipswich town': 'ipswich',
    'leicester city': 'leicester',
    'coventry city': 'coventry',
    'luton town': 'luton',
    'huddersfield town': 'huddersfield',
    'wigan athletic': 'wigan',
    'mansfield town': 'mansfield',
    'northampton town': 'northampton',
    'oldham athletic': 'oldham',
    'lincoln city': 'lincoln',
    'oxford united': 'oxford',
    'plymouth argyle': 'plymouth',
    'peterborough': 'peterboro',
    'peterborough united': 'peterboro',
    'milton keynes dons': 'milton keynes dons',
    'mk dons': 'milton keynes dons',
    # UCL / Europe SportyBet labels
    'galatasaray istanbul': 'galatasaray',
    'sporting': 'sp lisbon',
    'shakhtar donetsk': 'shakhtar',
    'shakhtar d': 'shakhtar',
    'lask linz': 'lask',
    'slovan bratislava': 'slovan bratislava',
    'bodoe/glimt': 'bodo/glimt',
    'bodø/glimt': 'bodo/glimt',
    # openfootball / ESPN UCL long names
    'manchester united fc': 'man united',
    'manchester united': 'man united',
    'manchester city fc': 'man city',
    'as roma': 'roma',
    'fc internazionale milano': 'inter',
    'internazionale': 'inter',
    'fc bayern münchen': 'bayern munich',
    'fc bayern munchen': 'bayern munich',
    'bayern münchen': 'bayern munich',
    'vfb stuttgart': 'stuttgart',
    'club atlético de madrid': 'ath madrid',
    'club atletico de madrid': 'ath madrid',
    'atlético madrid': 'ath madrid',
    'fc barcelona': 'barcelona',
    'paris saint-germain fc': 'paris sg',
    'paris saint-germain': 'paris sg',
    'paris saint germain': 'paris sg',
    'sporting clube de portugal': 'sp lisbon',
    'sport lisboa e benfica': 'benfica',
    'sl benfica': 'benfica',
    'feyenoord rotterdam': 'feyenoord',
    'fk bodø/glimt': 'bodo/glimt',
    'fk bodo/glimt': 'bodo/glimt',
    'fk shakhtar donetsk': 'shakhtar',
    'shakhtar donetsk': 'shakhtar',
    'šk slovan bratislava': 'slovan bratislava',
    'galatasaray sk': 'galatasaray',
    'aston villa fc': 'aston villa',
    'lille osc': 'lille',
    'villarreal cf': 'villarreal',
    # Extra leagues (SportyBet → football-data /new/)
    'fc copenhagen': 'fc copenhagen',
    'kobenhavn': 'fc copenhagen',
    'f.c. copenhagen': 'fc copenhagen',
    'fc københavn': 'fc copenhagen',
    'fc kobenhavn': 'fc copenhagen',
    'brøndby': 'brondby',
    'brondby if': 'brondby',
    'nordsjælland': 'nordsjaelland',
    'fc nordsjaelland': 'nordsjaelland',
    'sønderjyske': 'sonderjyske',
    'malmö ff': 'malmo ff',
    'malmo': 'malmo ff',
    'djurgårdens if': 'djurgarden',
    'djurgardens if': 'djurgarden',
    'bk häcken': 'hacken',
    'bk hacken': 'hacken',
    'ifk göteborg': 'goteborg',
    'ifk goteborg': 'goteborg',
    'bodø/glimt': 'bodo/glimt',
    'vålerenga': 'valerenga',
    'strømsgodset': 'stromsgodset',
    'tromsø': 'tromso',
    'inter miami cf': 'inter miami',
    'la galaxy': 'los angeles galaxy',
    'lafc': 'los angeles fc',
    'ny red bulls': 'new york red bulls',
    'nycfc': 'new york city',
    'flamengo': 'flamengo rj',
    'botafogo': 'botafogo rj',
    'red bull bragantino': 'bragantino',
    'rb bragantino': 'bragantino',
    'são paulo': 'sao paulo',
    'atletico mineiro': 'atletico-mg',
    'atlético mineiro': 'atletico-mg',
    'athletico paranaense': 'athletico-pr',
    'legia warsaw': 'legia',
    'legia warszawa': 'legia',
    'rakow czestochowa': 'rakow',
    'fcsb': 'fcsb',
    'steaua': 'fcsb',
    'universitatea craiova': 'univ. craiova',
    'dinamo bucharest': 'dinamo bucuresti',
}

# Blend weight for UEFA Champions League: UCL form vs domestic form.
UCL_FORM_WEIGHT = 0.50

# Dropped from SportyBet labels when matching football-data short clubs.
_TEAM_NOISE = re.compile(
    r'\b(?:fc|afc|cf|sc|town|city|rovers|athletic|wanderers|county|hotspur|'
    r'north end|albion|argyle|wednesday)\b',
    re.I,
)


@dataclass
class MatchRow:
    d: datetime
    h: str
    a: str
    hs: int
    as_: int
    hc: float | None = None
    ac: float | None = None
    hsh: float | None = None
    ash: float | None = None
    hst: float | None = None
    ast: float | None = None
    hy: float | None = None  # yellow cards
    ay: float | None = None
    hr: float | None = None  # red cards
    ar: float | None = None
    hf: float | None = None  # fouls → tackle intensity proxy
    af: float | None = None


@dataclass
class Forecast:
    ph: float
    pd: float
    pa: float
    lam: float
    mu: float
    o15: float
    o25: float
    btts: float
    home_scores: float
    away_scores: float
    home_or_o25: float
    away_or_o25: float
    home_either_half: float
    away_either_half: float
    corners_lam: float
    corners_mu: float
    shots_lam: float
    shots_mu: float
    sot_lam: float
    sot_mu: float
    cards_lam: float = 2.1
    cards_mu: float = 2.0
    tackles_lam: float = 16.0
    tackles_mu: float = 15.0
    kicks_lam: float = 8.5
    kicks_mu: float = 8.0
    league_key: str = ''
    covered: bool = False


def _canon(name: str) -> str:
    key = ' '.join(name.casefold().split())
    key = key.replace('&', ' and ')
    key = re.sub(r'\s+', ' ', key).strip()
    return TEAM_ALIASES.get(key, key)


def resolve_team(name: str, known: set[str]) -> str | None:
    """Map a SportyBet club label onto a football-data short name in this league."""
    if not known:
        return None
    c = _canon(name)
    if c in known:
        return c
    stripped = ' '.join(_TEAM_NOISE.sub(' ', c).split())
    if stripped and stripped in known:
        return stripped
    candidates = []
    for team in known:
        if team == c or team == stripped:
            return team
        if len(team) >= 4 and (team in c or c in team or (stripped and (team in stripped or stripped in team))):
            candidates.append(team)
        elif len(stripped) >= 4 and stripped == team:
            candidates.append(team)
    if len(candidates) == 1:
        return candidates[0]
    # Prefer the longest unique containment when several overlap (e.g. "sheffield").
    if candidates:
        best = sorted(candidates, key=len, reverse=True)
        if len(best) == 1 or len(best[0]) != len(best[1]):
            return best[0]
    return None


def _fnum(row: dict, key: str) -> float | None:
    try:
        return float(row[key])
    except Exception:
        return None


def _pois(k: int, lam: float) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam + k * math.log(max(lam, 1e-9)) - math.lgamma(k + 1))


def score_matrix(lam: float, mu: float, n: int = 12) -> dict[str, float]:
    P = [[_pois(i, lam) * _pois(j, mu) for j in range(n)] for i in range(n)]
    total = sum(sum(row) for row in P) or 1.0
    H = sum(P[i][j] for i in range(n) for j in range(n) if i > j) / total
    D = sum(P[i][i] for i in range(n)) / total
    A = sum(P[i][j] for i in range(n) for j in range(n) if i < j) / total
    btts = sum(P[i][j] for i in range(1, n) for j in range(1, n)) / total
    o15 = sum(P[i][j] for i in range(n) for j in range(n) if i + j >= 2) / total
    o25 = sum(P[i][j] for i in range(n) for j in range(n) if i + j >= 3) / total
    home_scores = 1.0 - sum(P[0][j] for j in range(n)) / total
    away_scores = 1.0 - sum(P[i][0] for i in range(n)) / total
    home_or_o25 = sum(P[i][j] for i in range(n) for j in range(n) if i > j or i + j >= 3) / total
    away_or_o25 = sum(P[i][j] for i in range(n) for j in range(n) if i < j or i + j >= 3) / total
    return {
        'H': H, 'D': D, 'A': A, 'btts': btts, 'o15': o15, 'o25': o25,
        'home_scores': home_scores, 'away_scores': away_scores,
        'home_or_o25': home_or_o25, 'away_or_o25': away_or_o25,
    }


def over_prob(lam: float, line: float, n: int = 40) -> float:
    """P(count > line) for a Poisson total with mean lam (half-lines use strict over)."""
    threshold = math.floor(line) + 1
    return sum(_pois(k, lam) for k in range(threshold, n))


def wmean(pairs: list[tuple[float, float]], prior: float, shrink: float = SHRINK) -> float:
    if not pairs:
        return prior
    sw = sum(w for _, w in pairs)
    sv = sum(v * w for v, w in pairs)
    return (shrink * prior + sv) / (shrink + sw)


class StatsmanEngine:
    def __init__(self, data_dir: str | Path | None = None, asof: datetime | None = None):
        self.data_dir = Path(data_dir or os.getenv('STATSMAN_DATA_DIR', './data/statsman'))
        self.asof = asof or datetime.now(timezone.utc).replace(tzinfo=None)
        self.train: dict[str, list[MatchRow]] = {}
        self.elo: dict[str, dict[str, float]] = {}
        self.known: dict[str, set[str]] = {}
        self._load_all()

    @staticmethod
    def _parse_match_date(value: str) -> datetime | None:
        for fmt in ('%d/%m/%Y', '%d/%m/%y'):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        return None

    def _load_csv(self, path: Path) -> list[MatchRow]:
        """Classic football-data season CSVs (HomeTeam/FTHG + match stats)."""
        if not path.exists():
            return []
        rows: list[MatchRow] = []
        with path.open(encoding='utf-8-sig', newline='') as handle:
            for r in csv.DictReader(handle):
                if not r.get('FTHG') or not r.get('Date'):
                    continue
                d = self._parse_match_date(r['Date'])
                if d is None or d >= self.asof:
                    continue
                rows.append(MatchRow(
                    d=d, h=_canon(r['HomeTeam']), a=_canon(r['AwayTeam']),
                    hs=int(r['FTHG']), as_=int(r['FTAG']),
                    hc=_fnum(r, 'HC'), ac=_fnum(r, 'AC'),
                    hsh=_fnum(r, 'HS'), ash=_fnum(r, 'AS'),
                    hst=_fnum(r, 'HST'), ast=_fnum(r, 'AST'),
                    hy=_fnum(r, 'HY'), ay=_fnum(r, 'AY'),
                    hr=_fnum(r, 'HR'), ar=_fnum(r, 'AR'),
                    hf=_fnum(r, 'HF'), af=_fnum(r, 'AF'),
                ))
        return rows

    def _load_new_csv(self, path: Path, league_name: str) -> list[MatchRow]:
        """Extra /new/ CSVs — Home/Away/HG/AG; filter on League column; no count stats."""
        if not path.exists():
            return []
        want = ' '.join(league_name.casefold().split())
        rows: list[MatchRow] = []
        with path.open(encoding='utf-8-sig', newline='') as handle:
            for r in csv.DictReader(handle):
                if not r.get('HG') or not r.get('Date') or not r.get('Home') or not r.get('Away'):
                    continue
                label = ' '.join((r.get('League') or '').casefold().split())
                if label != want:
                    continue
                d = self._parse_match_date(r['Date'])
                if d is None or d >= self.asof:
                    continue
                try:
                    hs, as_ = int(float(r['HG'])), int(float(r['AG']))
                except ValueError:
                    continue
                rows.append(MatchRow(
                    d=d, h=_canon(r['Home']), a=_canon(r['Away']),
                    hs=hs, as_=as_,
                ))
        return rows

    def _load_all(self) -> None:
        for key, filename in LEAGUE_FILES.items():
            rows = self._load_csv(self.data_dir / filename)
            if not rows:
                continue
            self.train[key] = rows
            self.elo[key] = self._fit_elo(rows)
            self.known[key] = {m.h for m in rows} | {m.a for m in rows}
        new_cache: dict[tuple[str, str], list[MatchRow]] = {}
        for key, (filename, league_name) in NEW_LEAGUE_FILES.items():
            cache_key = (filename, league_name)
            if cache_key not in new_cache:
                new_cache[cache_key] = self._load_new_csv(self.data_dir / filename, league_name)
            rows = new_cache[cache_key]
            if not rows:
                continue
            self.train[key] = rows
            self.elo[key] = self._fit_elo(rows)
            self.known[key] = {m.h for m in rows} | {m.a for m in rows}
        ucl_rows = self._load_csv(self.data_dir / 'ucl.csv')
        if ucl_rows:
            self.train['ucl'] = ucl_rows
            self.elo['ucl'] = self._fit_elo(ucl_rows)
            self.known['ucl'] = {m.h for m in ucl_rows} | {m.a for m in ucl_rows}

    @staticmethod
    def _fit_elo(ms: list[MatchRow]) -> dict[str, float]:
        R: dict[str, float] = defaultdict(lambda: 1500.0)
        for m in sorted(ms, key=lambda x: (x.d, x.h)):
            eh = 1 / (1 + 10 ** (-((R[m.h] + HA) - R[m.a]) / 400))
            s = 1.0 if m.hs > m.as_ else 0.5 if m.hs == m.as_ else 0.0
            R[m.h] += 20 * (s - eh)
            R[m.a] += 20 * ((1 - s) - (1 - eh))
        return dict(R)

    @staticmethod
    def _league_text(league: str) -> str:
        text = re.sub(r'[-–_/|]', ' ', league.casefold())
        return ' '.join(text.split())

    def resolve_league(self, league: str) -> str | None:
        text = self._league_text(league)
        # Cups / youth / reserves are not the domestic league CSVs.
        if re.search(r'\b(?:cup|trophy|youth|women|u21|u19|u23|reserve|friendl)', text):
            return None
        # Disambiguate Brazil Serie A vs Italy Serie A, Denmark vs Romania Superliga.
        if 'brazil' in text and 'serie a' in text and 'brazil serie a' in self.train:
            return 'brazil serie a'
        if 'brasileirao' in text and 'brasileirao' in self.train:
            return 'brasileirao'
        if 'denmark' in text and 'superliga' in text and 'denmark superliga' in self.train:
            return 'denmark superliga'
        if 'romania' in text and (
            'superliga' in text or re.search(r'\bliga\s*i\b', text) or 'liga 1' in text
        ) and 'romania superliga' in self.train:
            return 'romania superliga'
        if ('mls' in text or 'major league soccer' in text) and 'mls' in self.train:
            return 'mls'
        for key in sorted(ALL_LEAGUE_FILES, key=len, reverse=True):
            if key in text and key in self.train:
                return key
        return None

    @staticmethod
    def is_ucl(league: str) -> bool:
        text = ' '.join(league.casefold().split())
        if re.search(r'\b(?:youth|women|afc|two|elite)\b', text):
            return False
        return 'champions league' in text or text in {'ucl', 'uefa cl'}

    def find_club(self, name: str) -> tuple[str, str] | None:
        """Locate a club in any loaded domestic book → (league_key, canon team)."""
        seen_files: set[str] = set()
        hits: list[tuple[str, str]] = []
        for lg, known in self.known.items():
            if lg == 'ucl' or lg not in ALL_LEAGUE_FILES:
                continue
            filename = ALL_LEAGUE_FILES.get(lg)
            if filename in seen_files:
                continue
            team = resolve_team(name, known)
            if not team:
                continue
            if filename:
                seen_files.add(filename)
            hits.append((lg, team))
        if len(hits) == 1:
            return hits[0]
        if not hits:
            return None
        # Prefer the big-5 / main Europe books when a name collides.
        prefer = (
            'premier league', 'la liga', 'laliga', 'serie a', 'bundesliga',
            'ligue 1', 'eredivisie', 'liga portugal', 'süper lig', 'super lig',
            'brazil serie a', 'mls', 'eliteserien', 'allsvenskan', 'denmark superliga',
        )
        for key in prefer:
            for hit in hits:
                if hit[0] == key:
                    return hit
        return hits[0]

    def _rate_pair(self, ms: list[MatchRow], h: str, a: str, field: str) -> tuple[float, float]:
        """Decayed home/away attack × opponent defence for goals|corners|shots|sot|cards|fouls."""
        return self._rate_cross(ms, h, ms, a, field)

    @staticmethod
    def _card_count(m: MatchRow, venue: str) -> float | None:
        """Sporty-style card units: yellow=1, red≈2."""
        if venue == 'h':
            if m.hy is None and m.hr is None:
                return None
            return float(m.hy or 0) + 2.0 * float(m.hr or 0)
        if m.ay is None and m.ar is None:
            return None
        return float(m.ay or 0) + 2.0 * float(m.ar or 0)

    def _rate_cross(
        self,
        home_ms: list[MatchRow],
        h: str,
        away_ms: list[MatchRow],
        a: str,
        field: str,
    ) -> tuple[float, float]:
        """Same A/D model, allowing home and away sides to come from different leagues (UCL)."""
        def values(ms: list[MatchRow], team: str, venue: str, which: str) -> list[tuple[float, float]]:
            out = []
            for m in ms:
                if venue == 'h' and m.h != team:
                    continue
                if venue == 'a' and m.a != team:
                    continue
                age = max((self.asof - m.d).days, 0)
                w = 0.5 ** (age / HALF_LIFE)
                if field == 'goals':
                    gf = m.hs if venue == 'h' else m.as_
                    ga = m.as_ if venue == 'h' else m.hs
                elif field == 'corners':
                    gf = m.hc if venue == 'h' else m.ac
                    ga = m.ac if venue == 'h' else m.hc
                elif field == 'shots':
                    gf = m.hsh if venue == 'h' else m.ash
                    ga = m.ash if venue == 'h' else m.hsh
                elif field == 'sot':
                    gf = m.hst if venue == 'h' else m.ast
                    ga = m.ast if venue == 'h' else m.hst
                elif field == 'cards':
                    gf = self._card_count(m, venue)
                    ga = self._card_count(m, 'a' if venue == 'h' else 'h')
                elif field == 'fouls':
                    gf = m.hf if venue == 'h' else m.af
                    ga = m.af if venue == 'h' else m.hf
                else:
                    continue
                if gf is None or ga is None:
                    continue
                out.append((float(gf if which == 'gf' else ga), w))
            return out

        def priors(ms: list[MatchRow]) -> tuple[float, float]:
            if field == 'goals':
                return (
                    float(sum(m.hs for m in ms) / len(ms)) if ms else 1.35,
                    float(sum(m.as_ for m in ms) / len(ms)) if ms else 1.15,
                )
            if field == 'cards':
                vals_h = [self._card_count(m, 'h') for m in ms]
                vals_a = [self._card_count(m, 'a') for m in ms]
                vals_h = [v for v in vals_h if v is not None]
                vals_a = [v for v in vals_a if v is not None]
                return (
                    float(sum(vals_h) / len(vals_h)) if vals_h else 2.1,
                    float(sum(vals_a) / len(vals_a)) if vals_a else 2.0,
                )
            key_h, key_a, fallback = {
                'corners': ('hc', 'ac', (5.2, 4.6)),
                'shots': ('hsh', 'ash', (12.0, 10.0)),
                'sot': ('hst', 'ast', (4.2, 3.6)),
                'fouls': ('hf', 'af', (11.0, 10.5)),
            }[field]
            vals_h = [getattr(m, key_h) for m in ms if getattr(m, key_h) is not None]
            vals_a = [getattr(m, key_a) for m in ms if getattr(m, key_a) is not None]
            return (
                float(sum(vals_h) / len(vals_h)) if vals_h else fallback[0],
                float(sum(vals_a) / len(vals_a)) if vals_a else fallback[1],
            )

        prior_h, _ = priors(home_ms)
        _, prior_a = priors(away_ms)
        ha = wmean(values(home_ms, h, 'h', 'gf'), prior_h)
        aa = wmean(values(away_ms, a, 'a', 'gf'), prior_a)
        ad = wmean(values(away_ms, a, 'a', 'ga'), prior_h) / max(prior_h, 1e-6)
        hd = wmean(values(home_ms, h, 'h', 'ga'), prior_a) / max(prior_a, 1e-6)
        return max(ha * ad, 0.05), max(aa * hd, 0.05)

    @staticmethod
    def _proxy_kicks(shots_lam: float, shots_mu: float) -> tuple[float, float]:
        """Goal kicks ≈ shots faced (defending side clears after misses)."""
        return max(3.0, shots_mu * 0.72 + 2.5), max(3.0, shots_lam * 0.72 + 2.5)

    @staticmethod
    def _proxy_tackles(foul_lam: float, foul_mu: float) -> tuple[float, float]:
        """Tackles scaled from fouls intensity (football-data has HF/AF, not tackles)."""
        return max(8.0, foul_lam * 1.45), max(8.0, foul_mu * 1.45)

    def _uncovered(self, league_key: str = '') -> Forecast:
        return Forecast(
            ph=.45, pd=.26, pa=.29, lam=1.35, mu=1.15,
            o15=.70, o25=.48, btts=.52, home_scores=.72, away_scores=.68,
            home_or_o25=.70, away_or_o25=.62,
            home_either_half=.55, away_either_half=.48,
            corners_lam=5.2, corners_mu=4.6, shots_lam=12.0, shots_mu=10.0,
            sot_lam=4.2, sot_mu=3.6,
            cards_lam=2.1, cards_mu=2.0, tackles_lam=16.0, tackles_mu=15.0,
            kicks_lam=8.5, kicks_mu=8.0, league_key=league_key, covered=False,
        )

    def _forecast(
        self,
        ph: float,
        pd: float,
        pa: float,
        lam: float,
        mu: float,
        c_lam: float,
        c_mu: float,
        s_lam: float,
        s_mu: float,
        t_lam: float,
        t_mu: float,
        league_key: str,
        cards_lam: float = 2.1,
        cards_mu: float = 2.0,
        tackles_lam: float = 16.0,
        tackles_mu: float = 15.0,
        kicks_lam: float | None = None,
        kicks_mu: float | None = None,
    ) -> Forecast:
        goals = score_matrix(lam, mu)
        home_either = min(.95, max(ph, goals['H']) * 1.08)
        away_either = min(.95, max(pa, goals['A']) * 1.08)
        if kicks_lam is None or kicks_mu is None:
            kicks_lam, kicks_mu = self._proxy_kicks(s_lam, s_mu)
        return Forecast(
            ph=ph, pd=pd, pa=pa, lam=lam, mu=mu,
            o15=goals['o15'], o25=goals['o25'], btts=goals['btts'],
            home_scores=goals['home_scores'], away_scores=goals['away_scores'],
            home_or_o25=goals['home_or_o25'], away_or_o25=goals['away_or_o25'],
            home_either_half=home_either, away_either_half=away_either,
            corners_lam=c_lam, corners_mu=c_mu, shots_lam=s_lam, shots_mu=s_mu,
            sot_lam=t_lam, sot_mu=t_mu,
            cards_lam=cards_lam, cards_mu=cards_mu,
            tackles_lam=tackles_lam, tackles_mu=tackles_mu,
            kicks_lam=kicks_lam, kicks_mu=kicks_mu,
            league_key=league_key, covered=True,
        )

    def _ucl_team(self, name: str, domestic_key: str | None = None) -> str | None:
        known = self.known.get('ucl', set())
        return resolve_team(name, known) or (resolve_team(domestic_key, known) if domestic_key else None)

    def _side_probs(self, rh: float, ra: float, draw_share: float = 0.45) -> tuple[float, float, float]:
        p_h = 1 / (1 + 10 ** (-((rh + HA) - ra) / 400))
        rem = 1 - p_h
        return p_h, rem * draw_share, rem * (1 - draw_share)

    def price_ucl(self, home: str, away: str) -> Forecast:
        """Price UEFA CL from domestic form blended with UCL form when available."""
        home_club = self.find_club(home)
        away_club = self.find_club(away)
        uk_h = self._ucl_team(home, home_club[1] if home_club else None)
        uk_a = self._ucl_team(away, away_club[1] if away_club else None)
        ucl_ms = self.train.get('ucl') or []
        has_ucl = bool(uk_h and uk_a and ucl_ms)

        if home_club and away_club:
            hlg, hk = home_club
            alg, ak = away_club
            rh_d = self.elo[hlg].get(hk, 1500.0)
            ra_d = self.elo[alg].get(ak, 1500.0)
            ph_d, pd_d, pa_d = self._side_probs(rh_d, ra_d, draw_share=0.45)
            home_ms, away_ms = self.train[hlg], self.train[alg]
            lam_d, mu_d = self._rate_cross(home_ms, hk, away_ms, ak, 'goals')
            c_lam_d, c_mu_d = self._rate_cross(home_ms, hk, away_ms, ak, 'corners')
            s_lam_d, s_mu_d = self._rate_cross(home_ms, hk, away_ms, ak, 'shots')
            t_lam_d, t_mu_d = self._rate_cross(home_ms, hk, away_ms, ak, 'sot')
            card_h, card_a = self._rate_cross(home_ms, hk, away_ms, ak, 'cards')
            foul_h, foul_a = self._rate_cross(home_ms, hk, away_ms, ak, 'fouls')
            tac_h, tac_a = self._proxy_tackles(foul_h, foul_a)
            if has_ucl:
                rh_u = self.elo['ucl'].get(uk_h, 1500.0)
                ra_u = self.elo['ucl'].get(uk_a, 1500.0)
                ph_u, pd_u, pa_u = self._side_probs(rh_u, ra_u, draw_share=0.45)
                lam_u, mu_u = self._rate_pair(ucl_ms, uk_h, uk_a, 'goals')
                # Corners/shots often missing from UCL rows — keep domestic count markets.
                w = UCL_FORM_WEIGHT
                ph = (1 - w) * ph_d + w * ph_u
                pd = (1 - w) * pd_d + w * pd_u
                pa = (1 - w) * pa_d + w * pa_u
                total = ph + pd + pa or 1.0
                ph, pd, pa = ph / total, pd / total, pa / total
                lam = (1 - w) * lam_d + w * lam_u
                mu = (1 - w) * mu_d + w * mu_u
                return self._forecast(
                    ph, pd, pa, lam, mu,
                    c_lam_d, c_mu_d, s_lam_d, s_mu_d, t_lam_d, t_mu_d,
                    f'ucl-blend:{hlg}/{alg}',
                    cards_lam=card_h, cards_mu=card_a,
                    tackles_lam=tac_h, tackles_mu=tac_a,
                )
            return self._forecast(
                ph_d, pd_d, pa_d, lam_d, mu_d,
                c_lam_d, c_mu_d, s_lam_d, s_mu_d, t_lam_d, t_mu_d,
                f'ucl:{hlg}/{alg}',
                cards_lam=card_h, cards_mu=card_a,
                tackles_lam=tac_h, tackles_mu=tac_a,
            )

        if has_ucl:
            rh_u = self.elo['ucl'].get(uk_h, 1500.0)
            ra_u = self.elo['ucl'].get(uk_a, 1500.0)
            ph_u, pd_u, pa_u = self._side_probs(rh_u, ra_u, draw_share=0.45)
            lam_u, mu_u = self._rate_pair(ucl_ms, uk_h, uk_a, 'goals')
            return self._forecast(
                ph_u, pd_u, pa_u, lam_u, mu_u,
                5.2, 4.6, 12.0, 10.0, 4.2, 3.6,
                'ucl-only',
            )
        return self._uncovered('ucl')

    def price(self, home: str, away: str, league: str) -> Forecast:
        if self.is_ucl(league):
            return self.price_ucl(home, away)
        lg = self.resolve_league(league)
        known = self.known.get(lg or '', set())
        hk = resolve_team(home, known) if lg else None
        ak = resolve_team(away, known) if lg else None
        if not lg or not hk or not ak:
            return self._uncovered(lg or '')
        ms = self.train[lg]
        R = self.elo[lg]
        rh, ra = R.get(hk, 1500.0), R.get(ak, 1500.0)
        p_h = 1 / (1 + 10 ** (-((rh + HA) - ra) / 400))
        nd = sum(m.hs == m.as_ for m in ms)
        na = sum(m.hs < m.as_ for m in ms)
        split = nd / (nd + na) if (nd + na) else 0.5
        rem = 1 - p_h
        ph, pd, pa = p_h, rem * split, rem * (1 - split)
        lam, mu = self._rate_pair(ms, hk, ak, 'goals')
        c_lam, c_mu = self._rate_pair(ms, hk, ak, 'corners')
        s_lam, s_mu = self._rate_pair(ms, hk, ak, 'shots')
        t_lam, t_mu = self._rate_pair(ms, hk, ak, 'sot')
        card_h, card_a = self._rate_pair(ms, hk, ak, 'cards')
        foul_h, foul_a = self._rate_pair(ms, hk, ak, 'fouls')
        tac_h, tac_a = self._proxy_tackles(foul_h, foul_a)
        return self._forecast(
            ph, pd, pa, lam, mu, c_lam, c_mu, s_lam, s_mu, t_lam, t_mu, lg,
            cards_lam=card_h, cards_mu=card_a,
            tackles_lam=tac_h, tackles_mu=tac_a,
        )


def resolve_team_market_side(market_name: str, home_team: str = '', away_team: str = '') -> str | None:
    """Map a Sporty market title to home/away.

    SportyBet often titles team lines with the club name
    (\"Degerfors IF Over/Under\", \"US Catanzaro Corners\") instead of Home/Away.
    Without this, team lines are mispriced as match totals or odds-implied.
    """
    name = ' '.join((market_name or '').casefold().split())
    if not name:
        return None
    if re.search(r'\b(?:home|competitor1)\b', name) and not re.search(r'\baway\b', name):
        return 'home'
    if re.search(r'\b(?:away|competitor2)\b', name) and not re.search(r'\bhome\b', name):
        return 'away'

    def _club_hit(team: str) -> float:
        team = ' '.join((team or '').casefold().split())
        if len(team) < 3:
            return 0.0
        if team in name:
            return float(len(team))
        tokens = [
            t for t in re.split(r'[^a-z0-9]+', team)
            if len(t) >= 3 and t not in {'the', 'afc', 'ifc', 'us', 'sc', 'cf', 'ac'}
        ]
        if not tokens:
            return 0.0
        matched = sum(1 for t in tokens if t in name)
        if matched == 0:
            return 0.0
        # Require most tokens so short noise cannot flip sides alone.
        if matched < max(1, len(tokens) - 1) and matched < 2 and len(tokens) > 1:
            return 0.0
        return float(sum(len(t) for t in tokens if t in name))

    home_score = _club_hit(home_team)
    away_score = _club_hit(away_team)
    if home_score > away_score and home_score > 0:
        return 'home'
    if away_score > home_score and away_score > 0:
        return 'away'
    return None


def resolve_team_goals_side(market_name: str, home_team: str = '', away_team: str = '') -> str | None:
    """Goals O/U / to-score side helper (skips non-goals specialty markets)."""
    name = ' '.join((market_name or '').casefold().split())
    if re.search(r'corner|shot|card|booking|kick|tackle|btts|both teams|clean\s*sheet', name):
        return None
    if not re.search(r'over/?under|total|goals?|excluded|exact', name):
        return None
    if re.fullmatch(r'(?:over/?under|total(?:\s+goals)?)', name):
        return None
    return resolve_team_market_side(market_name, home_team, away_team)


def _is_pure_match_total(name: str) -> bool:
    """True for match-level totals with no club / home / away cue."""
    return bool(re.fullmatch(
        r'(?:over/?under|total(?:\s+goals)?|total\s+corners?|corners?(?:\s+over/?under)?|'
        r'total\s+shots?(?:\s+on\s+target)?|shots?(?:\s+on\s+target)?(?:\s+over/?under)?|'
        r'total\s+(?:cards?|bookings?)|(?:cards?|bookings?)(?:\s+over/?under)?|'
        r'excluded(?:\s+number\s+of)?\s+goals|exact(?:\s+number\s+of)?\s+goals)',
        name,
    ))


def _line(specifier: str, outcome_name: str) -> float | None:
    for part in (specifier or '').split('|'):
        if part.startswith('total='):
            try:
                return float(part.split('=', 1)[1])
            except ValueError:
                return None
    match = re.search(r'(\d+(?:\.\d+)?)', outcome_name or '')
    return float(match.group(1)) if match else None


def _is_over(outcome_id: str, outcome_name: str) -> bool | None:
    name = (outcome_name or '').casefold()
    if outcome_id in ('12', 'over') or name.startswith('over'):
        return True
    if outcome_id in ('13', 'under') or name.startswith('under'):
        return False
    return None


class StatsmanModel:
    """SportyBet outcome probabilities from the Statsman shop engine."""

    version = 'statsman-v1'

    def __init__(self, data_dir: str | Path | None = None):
        self.engine = StatsmanEngine(data_dir)
        self._cache: dict[str, Forecast] = {}
        self.fallback_version = 'odds-raw-v1'

    def forecast(self, fixture) -> Forecast:
        key = fixture.eventId
        if key not in self._cache:
            self._cache[key] = self.engine.price(fixture.homeTeam, fixture.awayTeam, fixture.league)
        return self._cache[key]

    def probability(self, fixture, market, outcome, supported) -> float:
        from app.schemas import Market

        fc = self.forecast(fixture)
        name = ' '.join((market.marketName or '').casefold().split())
        oname = ' '.join((outcome.outcomeName or '').casefold().split())
        over = _is_over(outcome.outcomeId, outcome.outcomeName)
        line = _line(market.specifier, outcome.outcomeName)

        if supported == Market.HOME:
            return fc.ph
        if supported == Market.DRAW:
            return fc.pd
        if supported == Market.AWAY:
            return fc.pa
        if supported == Market.OVER_1_5:
            return fc.o15
        if supported == Market.OVER_2_5:
            return fc.o25
        if supported == Market.UNDER_3_5:
            # Approximate under 3.5 from Poisson mass
            return max(.001, min(.999, 1 - sum(
                _pois(i, fc.lam) * _pois(j, fc.mu) for i in range(12) for j in range(12) if i + j >= 4
            )))
        if supported == Market.BTTS_YES:
            return fc.btts
        if supported == Market.BTTS_NO:
            return 1 - fc.btts
        if supported in (Market.DOUBLE_CHANCE_1X, Market.DOUBLE_CHANCE_12, Market.DOUBLE_CHANCE_X2):
            mapping = {
                Market.DOUBLE_CHANCE_1X: fc.ph + fc.pd,
                Market.DOUBLE_CHANCE_12: fc.ph + fc.pa,
                Market.DOUBLE_CHANCE_X2: fc.pd + fc.pa,
            }
            return mapping[supported]

        home_team = getattr(fixture, 'homeTeam', '')
        away_team = getattr(fixture, 'awayTeam', '')
        side = resolve_team_market_side(market.marketName, home_team, away_team)

        # Clean sheet (Yes = that side concedes 0)
        if re.search(r'clean\s*sheet', name):
            yes = oname in ('yes', 'gg') or outcome.outcomeId in ('74', 'yes')
            no = oname in ('no', 'ng') or outcome.outcomeId in ('76', 'no')
            # Home CS Yes = away scores 0 = 1 - away_scores
            if side == 'home':
                p_yes = 1 - fc.away_scores
            elif side == 'away':
                p_yes = 1 - fc.home_scores
            else:
                return 0.5  # club/title unresolved — do not use short-odds implied
            if yes:
                return p_yes
            if no:
                return 1 - p_yes

        # Home/Away or Over 2.5 (also \"Arsenal or Over 2.5\")
        if re.search(r'\bor\b', name) and re.search(r'over', name) and (line == 2.5 or '2.5' in name + oname):
            if side == 'home':
                return fc.home_or_o25
            if side == 'away':
                return fc.away_or_o25
            return 0.5

        # Win either half
        if re.search(r'either half|win (?:a |one )?half', name):
            if side == 'home':
                return fc.home_either_half
            if side == 'away':
                return fc.away_either_half
            return 0.5

        # Exact / excluded goals (exact integer line)
        if re.search(r'excluded|exact number of goals|\bexact goals\b', name) and not re.search(
            r'correct score|exact score|half|handicap|player', name
        ):
            exact = _exact_line(market.specifier, outcome.outcomeName)
            if exact is not None:
                if side == 'home':
                    return max(.001, min(.999, _pois(exact, fc.lam)))
                if side == 'away':
                    return max(.001, min(.999, _pois(exact, fc.mu)))
                leftover = re.sub(
                    r'\b(?:excluded|exact|number|of|goals?|total|over|under|team)\b', ' ', name,
                )
                if not _is_pure_match_total(name) and re.search(r'[a-z]{3,}', leftover):
                    return 0.5  # club-titled but unresolved
                return max(.001, min(.999, sum(
                    _pois(i, fc.lam) * _pois(j, fc.mu)
                    for i in range(12) for j in range(12) if i + j == exact
                )))

        # Corners / shots / SOT / cards totals
        if over is not None and line is not None:
            if re.search(r'\bcorners?\b', name):
                if side == 'home':
                    p_over = over_prob(fc.corners_lam, line)
                elif side == 'away':
                    p_over = over_prob(fc.corners_mu, line)
                elif _is_pure_match_total(name) or not re.search(r'[a-z]{3,}', re.sub(
                    r'\b(?:total|corners?|over/?under)\b', ' ', name,
                )):
                    p_over = over_prob(fc.corners_lam + fc.corners_mu, line)
                else:
                    return 0.5
                return p_over if over else 1 - p_over
            if re.search(r'\bshots?\b', name):
                use_sot = 'on target' in name
                lam = fc.sot_lam if use_sot else fc.shots_lam
                mu = fc.sot_mu if use_sot else fc.shots_mu
                if side == 'home':
                    p_over = over_prob(lam, line)
                elif side == 'away':
                    p_over = over_prob(mu, line)
                elif _is_pure_match_total(name) or not re.search(r'[a-z]{3,}', re.sub(
                    r'\b(?:total|shots?|on|target|over/?under)\b', ' ', name,
                )):
                    p_over = over_prob(lam + mu, line)
                else:
                    return 0.5
                return p_over if over else 1 - p_over
            if re.search(r'\b(?:cards?|bookings?)\b', name):
                if side == 'home':
                    p_over = over_prob(fc.cards_lam, line)
                elif side == 'away':
                    p_over = over_prob(fc.cards_mu, line)
                elif _is_pure_match_total(name) or not re.search(r'[a-z]{3,}', re.sub(
                    r'\b(?:total|cards?|bookings?|over/?under)\b', ' ', name,
                )):
                    p_over = over_prob(fc.cards_lam + fc.cards_mu, line)
                else:
                    return 0.5
                return p_over if over else 1 - p_over
            # Match / team goals O/U (exclusive Investor list + alternate lines; team O0.5 = to-score proxy)
            if re.search(r'over/under|total(?:\s+goals)?|\bgoals?\b', name) and not re.search(
                r'corner|shot|card|kick|tackle|excluded|exact', name
            ):
                goals_side = resolve_team_goals_side(market.marketName, home_team, away_team) or side
                if goals_side == 'home':
                    p_over = over_prob(fc.lam, line)
                elif goals_side == 'away':
                    p_over = over_prob(fc.mu, line)
                elif re.fullmatch(r'(?:over/?under|total(?:\s+goals)?)', name):
                    p_over = over_prob(fc.lam + fc.mu, line)
                else:
                    # Club-titled line we could not map — do not inflate with match totals.
                    return 0.5
                return p_over if over else 1 - p_over

        # Uncovered specialty → mild bookmaker-implied fallback marker via low confidence
        return max(.001, min(.999, 1 / max(outcome.odds, 1.01)))


def _exact_line(specifier: str, outcome_name: str) -> int | None:
    for part in (specifier or '').split('|'):
        if part.startswith('total=') or part.startswith('exact=') or part.startswith('goals='):
            try:
                return int(float(part.split('=', 1)[1]))
            except ValueError:
                return None
    match = re.search(r'(?:^|\s)(\d+)(?:\s|$)', outcome_name or '')
    if match:
        return int(match.group(1))
    match = re.search(r'exact(?:ly)?\s+(\d+)', (outcome_name or '').casefold())
    return int(match.group(1)) if match else None

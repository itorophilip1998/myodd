"""Statsman shop engine — Elo 1X2 + decayed attack/defence for goals, corners, shots, SOT.

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
TO_SCORE_LO = 58.0
TO_SCORE_HI = 65.0
STRONG_SIDE = 66.0

# Display league / path fragment → CSV filename under data dir
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
    league_key: str
    covered: bool


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

    def _load_csv(self, path: Path) -> list[MatchRow]:
        if not path.exists():
            return []
        rows: list[MatchRow] = []
        with path.open(encoding='utf-8-sig', newline='') as handle:
            for r in csv.DictReader(handle):
                if not r.get('FTHG') or not r.get('Date'):
                    continue
                try:
                    d = datetime.strptime(r['Date'], '%d/%m/%Y')
                except ValueError:
                    continue
                if d >= self.asof:
                    continue
                rows.append(MatchRow(
                    d=d, h=_canon(r['HomeTeam']), a=_canon(r['AwayTeam']),
                    hs=int(r['FTHG']), as_=int(r['FTAG']),
                    hc=_fnum(r, 'HC'), ac=_fnum(r, 'AC'),
                    hsh=_fnum(r, 'HS'), ash=_fnum(r, 'AS'),
                    hst=_fnum(r, 'HST'), ast=_fnum(r, 'AST'),
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

    def resolve_league(self, league: str) -> str | None:
        text = ' '.join(league.casefold().split())
        # Cups / youth / reserves are not the domestic league CSVs.
        if re.search(r'\b(?:cup|trophy|youth|women|u21|u19|u23|reserve|friendl)', text):
            return None
        for key in sorted(LEAGUE_FILES, key=len, reverse=True):
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
            if lg == 'ucl' or lg not in LEAGUE_FILES:
                continue
            filename = LEAGUE_FILES.get(lg)
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
        )
        for key in prefer:
            for hit in hits:
                if hit[0] == key:
                    return hit
        return hits[0]

    def _rate_pair(self, ms: list[MatchRow], h: str, a: str, field: str) -> tuple[float, float]:
        """Decayed home/away attack × opponent defence for goals|corners|shots|sot."""
        return self._rate_cross(ms, h, ms, a, field)

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
                else:  # sot
                    gf = m.hst if venue == 'h' else m.ast
                    ga = m.ast if venue == 'h' else m.hst
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
            key_h, key_a, fallback = {
                'corners': ('hc', 'ac', (5.2, 4.6)),
                'shots': ('hsh', 'ash', (12.0, 10.0)),
                'sot': ('hst', 'ast', (4.2, 3.6)),
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

    def _uncovered(self, league_key: str = '') -> Forecast:
        return Forecast(
            ph=.45, pd=.26, pa=.29, lam=1.35, mu=1.15,
            o15=.70, o25=.48, btts=.52, home_scores=.72, away_scores=.68,
            home_or_o25=.70, away_or_o25=.62,
            home_either_half=.55, away_either_half=.48,
            corners_lam=5.2, corners_mu=4.6, shots_lam=12.0, shots_mu=10.0,
            sot_lam=4.2, sot_mu=3.6, league_key=league_key, covered=False,
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
    ) -> Forecast:
        goals = score_matrix(lam, mu)
        home_either = min(.95, max(ph, goals['H']) * 1.08)
        away_either = min(.95, max(pa, goals['A']) * 1.08)
        return Forecast(
            ph=ph, pd=pd, pa=pa, lam=lam, mu=mu,
            o15=goals['o15'], o25=goals['o25'], btts=goals['btts'],
            home_scores=goals['home_scores'], away_scores=goals['away_scores'],
            home_or_o25=goals['home_or_o25'], away_or_o25=goals['away_or_o25'],
            home_either_half=home_either, away_either_half=away_either,
            corners_lam=c_lam, corners_mu=c_mu, shots_lam=s_lam, shots_mu=s_mu,
            sot_lam=t_lam, sot_mu=t_mu, league_key=league_key, covered=True,
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
                )
            return self._forecast(
                ph_d, pd_d, pa_d, lam_d, mu_d,
                c_lam_d, c_mu_d, s_lam_d, s_mu_d, t_lam_d, t_mu_d,
                f'ucl:{hlg}/{alg}',
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
        return self._forecast(ph, pd, pa, lam, mu, c_lam, c_mu, s_lam, s_mu, t_lam, t_mu, lg)


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

        # Team to score
        if re.search(r'to score|scores?\b|team score', name) and not re.search(r'both|btts|gg', name):
            home = bool(re.search(r'\b(?:home|competitor1)\b', name + ' ' + oname))
            away = bool(re.search(r'\b(?:away|competitor2)\b', name + ' ' + oname))
            yes = oname in ('yes', 'gg') or 'yes' in oname or outcome.outcomeId in ('74', 'yes')
            no = oname in ('no', 'ng') or outcome.outcomeId in ('76', 'no')
            p = fc.home_scores if home and not away else fc.away_scores if away and not home else None
            if p is not None:
                if yes:
                    return p
                if no:
                    return 1 - p

        # Home/Away or Over 2.5
        if re.search(r'\bor\b', name) and re.search(r'over', name) and (line == 2.5 or '2.5' in name + oname):
            if re.search(r'\b(?:home|competitor1)\b', name) and not re.search(r'\baway\b', name):
                return fc.home_or_o25
            if re.search(r'\b(?:away|competitor2)\b', name) and not re.search(r'\bhome\b', name):
                return fc.away_or_o25

        # Win either half
        if re.search(r'either half|win (?:a |one )?half', name):
            if re.search(r'\b(?:home|competitor1)\b', name):
                return fc.home_either_half
            if re.search(r'\b(?:away|competitor2)\b', name):
                return fc.away_either_half

        # Corners / shots / SOT totals
        if over is not None and line is not None:
            if re.search(r'\bcorners?\b', name) and not re.search(r'\b(?:home|away|competitor)\b', name):
                total = fc.corners_lam + fc.corners_mu
                p_over = over_prob(total, line)
                return p_over if over else 1 - p_over
            if re.search(r'\bcorners?\b', name) and re.search(r'\b(?:home|competitor1)\b', name):
                p_over = over_prob(fc.corners_lam, line)
                return p_over if over else 1 - p_over
            if re.search(r'\bcorners?\b', name) and re.search(r'\b(?:away|competitor2)\b', name):
                p_over = over_prob(fc.corners_mu, line)
                return p_over if over else 1 - p_over
            if re.search(r'\bshots?\b', name) and 'on target' not in name and not re.search(r'\b(?:home|away|competitor)\b', name):
                total = fc.shots_lam + fc.shots_mu
                p_over = over_prob(total, line)
                return p_over if over else 1 - p_over
            if re.search(r'\bshots?\b', name) and 'on target' in name and not re.search(r'\b(?:home|away|competitor)\b', name):
                total = fc.sot_lam + fc.sot_mu
                p_over = over_prob(total, line)
                return p_over if over else 1 - p_over
            # Generic team goals O/U already handled via supported; team shots:
            if re.search(r'\bshots?\b', name) and 'on target' not in name:
                if re.search(r'\b(?:home|competitor1)\b', name):
                    p_over = over_prob(fc.shots_lam, line)
                    return p_over if over else 1 - p_over
                if re.search(r'\b(?:away|competitor2)\b', name):
                    p_over = over_prob(fc.shots_mu, line)
                    return p_over if over else 1 - p_over
            if re.search(r'\bshots?\b', name) and 'on target' in name:
                if re.search(r'\b(?:home|competitor1)\b', name):
                    p_over = over_prob(fc.sot_lam, line)
                    return p_over if over else 1 - p_over
                if re.search(r'\b(?:away|competitor2)\b', name):
                    p_over = over_prob(fc.sot_mu, line)
                    return p_over if over else 1 - p_over
            # Match goals O/U alternate lines
            if re.search(r'over/under|total(?:\s+goals)?', name) and not re.search(r'corner|shot|card|kick|tackle', name):
                if not re.search(r'\b(?:home|away|competitor)\b', name):
                    total_lam = fc.lam + fc.mu
                    p_over = over_prob(total_lam, line)
                    return p_over if over else 1 - p_over

        # Uncovered specialty → mild bookmaker-implied fallback marker via low confidence
        return max(.001, min(.999, 1 / max(outcome.odds, 1.01)))

"""Statsman engine + ticket pick gates."""
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.llms.statsman import Forecast, StatsmanEngine, StatsmanModel, score_matrix
from app.schemas import Market, ScoredSelection
from app.tools.statsman_picks import apply_statsman_ticket_filter, keep_statsman_pick, statsman_market_allowed


DATA = Path(__file__).resolve().parents[1] / 'data' / 'statsman'


def selection(**kwargs):
    now = datetime.now(timezone.utc) + timedelta(hours=3)
    base = dict(
        eventId='e1', marketId='18', outcomeId='12', specifier='total=2.5',
        odds=1.25, homeTeam='Arsenal', awayTeam='Chelsea', league='England - Premier League',
        marketName='Over/Under', selectionName='Over 2.5', kickoffAt=now,
        supportedMarket=Market.OVER_2_5, probability=.8, confidence=80,
        modelVersion='statsman-v1',
    )
    base.update(kwargs)
    return ScoredSelection(**base)


class StatsmanEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (DATA / 'E0.csv').exists():
            raise unittest.SkipTest('statsman CSVs missing')
        cls.engine = StatsmanEngine(DATA, asof=datetime(2026, 11, 3))

    def test_premier_league_prices_known_clubs(self):
        fc = self.engine.price('Arsenal', 'Chelsea', 'England Premier League')
        self.assertTrue(fc.covered)
        self.assertGreater(fc.ph + fc.pd + fc.pa, 0.99)
        self.assertLess(abs(fc.ph + fc.pd + fc.pa - 1), 0.02)
        self.assertGreater(fc.o15, 0.5)
        self.assertGreater(fc.corners_lam + fc.corners_mu, 5)

    def test_championship_sportybet_names_are_covered(self):
        fc = self.engine.price('Blackburn Rovers', 'Stoke City', 'Championship')
        self.assertTrue(fc.covered)
        self.assertGreaterEqual(fc.o15, 0.70)
        qpr = self.engine.price('Queens Park Rangers', 'Burnley', 'Championship')
        self.assertTrue(qpr.covered)
        self.assertGreaterEqual(qpr.o15, 0.76)

    def test_ucl_uses_domestic_form(self):
        fc = self.engine.price('Man Utd', 'Roma', 'UEFA Champions League')
        self.assertTrue(fc.covered)
        self.assertTrue(fc.league_key.startswith('ucl'))
        self.assertGreater(fc.o15, 0.65)
        # Shakhtar has no domestic CSV; with ucl.csv it can still price from UCL form alone.
        shakhtar = self.engine.price('Shakhtar D', 'Sporting', 'UEFA Champions League')
        if (DATA / 'ucl.csv').exists() and 'shakhtar' in self.engine.known.get('ucl', ()):
            self.assertTrue(shakhtar.covered)
        else:
            self.assertFalse(shakhtar.covered)

    def test_ucl_blends_when_ucl_csv_present(self):
        if not (DATA / 'ucl.csv').exists():
            self.skipTest('ucl.csv missing')
        fc = self.engine.price('Man Utd', 'Roma', 'UEFA Champions League')
        self.assertTrue(fc.covered)
        if 'man united' in self.engine.known.get('ucl', ()) and 'roma' in self.engine.known.get('ucl', ()):
            self.assertTrue(fc.league_key.startswith('ucl-blend:'))

    def test_score_matrix_home_or_over(self):
        m = score_matrix(2.0, 1.0)
        self.assertGreater(m['home_or_o25'], m['H'])
        self.assertGreater(m['home_scores'], 0.7)


class StatsmanPickTests(unittest.TestCase):
    def test_goals_require_76(self):
        fc = Forecast(
            ph=.7, pd=.15, pa=.15, lam=2, mu=1, o15=.9, o25=.8, btts=.6,
            home_scores=.85, away_scores=.7, home_or_o25=.9, away_or_o25=.7,
            home_either_half=.75, away_either_half=.55,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='premier league', covered=True,
        )
        self.assertTrue(keep_statsman_pick(selection(confidence=80), fc))
        self.assertFalse(keep_statsman_pick(selection(confidence=70), fc))

    def test_side_band_to_score(self):
        fc = Forecast(
            ph=.62, pd=.2, pa=.18, lam=1.4, mu=1.1, o15=.7, o25=.45, btts=.5,
            home_scores=.78, away_scores=.65, home_or_o25=.75, away_or_o25=.55,
            home_either_half=.7, away_either_half=.5,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='premier league', covered=True,
        )
        pick = selection(
            marketId='29', marketName='Home team to score', selectionName='Yes',
            supportedMarket=Market.OTHER, confidence=78, probability=.78,
        )
        self.assertTrue(keep_statsman_pick(pick, fc))
        raw = selection(marketId='1', marketName='1X2', selectionName='Home', supportedMarket=Market.HOME)
        self.assertFalse(statsman_market_allowed(raw.marketId, raw.marketName, '', raw.selectionName))

    def test_strong_side_maps_to_or_over(self):
        fc = Forecast(
            ph=.70, pd=.15, pa=.15, lam=1.8, mu=1.0, o15=.85, o25=.6, btts=.55,
            home_scores=.85, away_scores=.6, home_or_o25=.88, away_or_o25=.55,
            home_either_half=.78, away_either_half=.5,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='premier league', covered=True,
        )
        pick = selection(
            marketId='x', marketName='Home or Over 2.5', selectionName='Yes',
            specifier='', supportedMarket=Market.OTHER, confidence=88, probability=.88,
        )
        self.assertTrue(keep_statsman_pick(pick, fc))

    def test_filter_drops_uncovered(self):
        model = StatsmanModel(DATA) if (DATA / 'E0.csv').exists() else None
        if model is None:
            self.skipTest('no data')
        pool = [selection(homeTeam='Unknown FC', awayTeam='Ghost Utd', league='Fantasy League', confidence=90)]
        kept = apply_statsman_ticket_filter(pool, model)
        self.assertEqual(kept, [])


if __name__ == '__main__':
    unittest.main()

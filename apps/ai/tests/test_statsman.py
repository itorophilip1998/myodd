"""Statsman engine + ticket pick gates."""
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.llms.statsman import (
    Forecast, StatsmanEngine, StatsmanModel, over_prob,
    resolve_team_goals_side, resolve_team_market_side, score_matrix,
)
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

    def test_extra_new_leagues_are_covered(self):
        cases = [
            ('FC Copenhagen', 'Brondby', 'Denmark - Superliga', 'denmark superliga'),
            ('Malmo FF', 'AIK', 'Sweden - Allsvenskan', 'allsvenskan'),
            ('Bodo/Glimt', 'Rosenborg', 'Norway - Eliteserien', 'eliteserien'),
            ('Inter Miami', 'Atlanta Utd', 'USA - MLS', 'mls'),
            ('Flamengo', 'Palmeiras', 'Brazil - Serie A', 'brazil serie a'),
            ('Legia', 'Lech Poznan', 'Poland - Ekstraklasa', 'ekstraklasa'),
            ('FCSB', 'CFR Cluj', 'Romania - Superliga', 'romania superliga'),
        ]
        for home, away, league, key in cases:
            with self.subTest(league=league):
                if key not in self.engine.train:
                    self.skipTest(f'{key} CSV not loaded')
                fc = self.engine.price(home, away, league)
                self.assertTrue(fc.covered, f'{home} vs {away} in {league}')
                self.assertEqual(fc.league_key, key)
                self.assertGreater(fc.o15, 0.4)

    def test_brazil_serie_a_does_not_resolve_to_italy(self):
        if 'brazil serie a' not in self.engine.train:
            self.skipTest('BRA.csv missing')
        self.assertEqual(self.engine.resolve_league('Brazil Serie A'), 'brazil serie a')
        self.assertEqual(self.engine.resolve_league('Italy Serie A'), 'serie a')

    def test_national_team_tournaments_detected_not_friendlies(self):
        yes = [
            'UEFA Nations League',
            'FIFA World Cup',
            'World Cup Qualification',
            'UEFA Euro',
            'European Championship',
            'Copa America',
            'Africa Cup of Nations',
            'AFCON',
            'AFC Asian Cup',
            'CONCACAF Gold Cup',
            'Olympic Football',
        ]
        no = [
            'International Friendly',
            'Friendlies',
            'UEFA Champions League',
            'UEFA Europa League',
            'England - Premier League',
            'Championship',  # EFL
            'U21 Euro',
            'FIFA U20 World Cup',
        ]
        for league in yes:
            with self.subTest(league=league):
                self.assertTrue(self.engine.is_national_team_tournament(league), league)
                self.assertFalse(self.engine.is_friendly(league), league)
        for league in no:
            with self.subTest(league=league):
                self.assertFalse(self.engine.is_national_team_tournament(league), league)

    def test_european_championship_not_efl_championship(self):
        self.assertIsNone(self.engine.resolve_league('European Championship'))
        self.assertEqual(self.engine.resolve_league('Championship'), 'championship')
        self.assertEqual(self.engine.resolve_league('England - Championship'), 'championship')

    def test_intl_prices_known_nations(self):
        if 'intl' not in self.engine.train:
            self.skipTest('intl.csv missing')
        fc = self.engine.price('France', 'Italy', 'UEFA Nations League')
        self.assertTrue(fc.covered)
        self.assertTrue(fc.league_key.startswith('intl:'))
        self.assertGreater(fc.o15, 0.45)
        friendly = self.engine.price('France', 'Italy', 'International Friendly')
        self.assertFalse(friendly.covered)
        self.assertEqual(friendly.league_key, 'friendly')


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

    def test_uncovered_goals_use_book_implied(self):
        fc = Forecast(
            ph=.45, pd=.26, pa=.29, lam=1.35, mu=1.15, o15=.70, o25=.48, btts=.52,
            home_scores=.72, away_scores=.68, home_or_o25=.70, away_or_o25=.62,
            home_either_half=.55, away_either_half=.48,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='', covered=False,
        )
        # Short O1.5 → book implied ≥76% even without CSV coverage.
        short = selection(confidence=70, odds=1.20, probability=.70)
        self.assertTrue(keep_statsman_pick(short, fc))
        long = selection(confidence=70, odds=1.35, probability=.70)
        self.assertFalse(keep_statsman_pick(long, fc))
        # Side-band markets stay off when uncovered.
        over05 = selection(
            marketId='19', marketName='Home team total goals', selectionName='Over 0.5',
            specifier='total=0.5', supportedMarket=Market.OTHER, confidence=80, odds=1.20,
        )
        self.assertFalse(keep_statsman_pick(over05, fc))

    def test_side_band_to_score_uses_over_05_or_clean_sheet(self):
        fc = Forecast(
            ph=.62, pd=.2, pa=.18, lam=1.4, mu=1.1, o15=.7, o25=.45, btts=.5,
            home_scores=.78, away_scores=.65, home_or_o25=.75, away_or_o25=.55,
            home_either_half=.7, away_either_half=.5,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='premier league', covered=True,
        )
        over05 = selection(
            marketId='19', marketName='Home team total goals', selectionName='Over 0.5',
            specifier='total=0.5', supportedMarket=Market.OTHER, confidence=78, probability=.78,
        )
        cs_no = selection(
            marketId='x', marketName='Away team clean sheet', selectionName='No',
            specifier='', supportedMarket=Market.OTHER, confidence=78, probability=.78,
        )
        self.assertTrue(keep_statsman_pick(over05, fc))
        self.assertTrue(keep_statsman_pick(cs_no, fc))
        # Team O0.5 only needs the 58–65% favourite band — no map confidence floor.
        soft = selection(
            marketId='19', marketName='Home team total goals', selectionName='Over 0.5',
            specifier='total=0.5', supportedMarket=Market.OTHER, confidence=50, probability=.50,
        )
        self.assertTrue(keep_statsman_pick(soft, fc))
        raw = selection(marketId='1', marketName='1X2', selectionName='Home', supportedMarket=Market.HOME)
        self.assertFalse(statsman_market_allowed(raw.marketId, raw.marketName, '', raw.selectionName))

    def test_club_titled_team_over_05_not_match_totals_or_underdog(self):
        """Sporty \"Degerfors IF Over/Under\" must not be priced/gated as match O0.5."""
        self.assertEqual(
            resolve_team_goals_side('Degerfors IF Over/Under', 'Degerfors IF', 'GAIS'), 'home')
        self.assertEqual(
            resolve_team_goals_side('US Catanzaro Over/Under', 'Cesena FC', 'US Catanzaro'), 'away')
        # Coin-flip / underdog home — no to_score favourite → drop club-titled O0.5
        coin = Forecast(
            ph=.34, pd=.29, pa=.37, lam=1.37, mu=1.41, o15=.77, o25=.5, btts=.56,
            home_scores=.75, away_scores=.76, home_or_o25=.7, away_or_o25=.7,
            home_either_half=.55, away_either_half=.55,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='allsvenskan', covered=True,
        )
        degerfors = selection(
            homeTeam='Degerfors IF', awayTeam='GAIS', league='Allsvenskan',
            marketId='19', marketName='Degerfors IF Over/Under', selectionName='Over 0.5',
            specifier='total=0.5', supportedMarket=Market.OTHER, confidence=94, probability=.94,
        )
        self.assertFalse(keep_statsman_pick(degerfors, coin))
        # Away underdog club title while home is to_score favourite → drop
        fav_home = Forecast(
            ph=.61, pd=.19, pa=.20, lam=1.46, mu=1.23, o15=.75, o25=.48, btts=.54,
            home_scores=.77, away_scores=.71, home_or_o25=.8, away_or_o25=.55,
            home_either_half=.7, away_either_half=.5,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='serie b', covered=True,
        )
        catanzaro = selection(
            homeTeam='Cesena FC', awayTeam='US Catanzaro', league='Serie B',
            marketId='20', marketName='US Catanzaro Over/Under', selectionName='Over 0.5',
            specifier='total=0.5', supportedMarket=Market.OTHER, confidence=90, probability=.90,
        )
        self.assertFalse(keep_statsman_pick(catanzaro, fav_home))
        cesena = selection(
            homeTeam='Cesena FC', awayTeam='US Catanzaro', league='Serie B',
            marketId='19', marketName='Cesena FC Over/Under', selectionName='Over 0.5',
            specifier='total=0.5', supportedMarket=Market.OTHER, confidence=77, probability=.77,
        )
        self.assertTrue(keep_statsman_pick(cesena, fav_home))

    def test_club_titled_corners_cards_clean_sheet_and_or_over(self):
        """Same club-title bug must not inflate corners/cards or break CS / 1·over sides."""
        self.assertEqual(
            resolve_team_market_side('Degerfors IF Corners', 'Degerfors IF', 'GAIS'), 'home')
        self.assertEqual(
            resolve_team_market_side('GAIS Total Cards', 'Degerfors IF', 'GAIS'), 'away')
        self.assertEqual(
            resolve_team_market_side('GAIS or Over 2.5', 'Degerfors IF', 'GAIS'), 'away')
        self.assertEqual(
            resolve_team_market_side('Degerfors IF Clean Sheet', 'Degerfors IF', 'GAIS'), 'home')

        if 'allsvenskan' not in StatsmanEngine(DATA, asof=__import__('datetime').datetime(2026, 11, 7)).train:
            self.skipTest('allsvenskan missing')
        eng = StatsmanEngine(DATA, asof=__import__('datetime').datetime(2026, 11, 7))
        model = StatsmanModel(DATA)
        model.engine = eng
        fc = eng.price('Degerfors IF', 'GAIS', 'Allsvenskan')

        class Fix:
            eventId, homeTeam, awayTeam, league = 'e', 'Degerfors IF', 'GAIS', 'Allsvenskan'

        class Mkt:
            def __init__(self, name, spec='total=4.5', mid='166'):
                self.marketName, self.specifier, self.marketId = name, spec, mid

        class Out:
            def __init__(self, name='Over 4.5', odds=1.25):
                self.outcomeName, self.outcomeId, self.odds = name, '12', odds

        club_corners = model.probability(Fix(), Mkt('Degerfors IF Corners'), Out(), Market.OTHER)
        match_corners = model.probability(Fix(), Mkt('Total Corners', 'total=8.5'), Out('Over 8.5'), Market.OTHER)
        self.assertAlmostEqual(club_corners, over_prob(fc.corners_lam, 4.5), places=3)
        self.assertLess(club_corners, over_prob(fc.corners_lam + fc.corners_mu, 4.5) - 0.05)
        self.assertAlmostEqual(match_corners, over_prob(fc.corners_lam + fc.corners_mu, 8.5), places=3)

        cs_no = model.probability(
            Fix(), Mkt('Degerfors IF Clean Sheet', '', 'x'), Out('No', 1.30), Market.OTHER)
        self.assertAlmostEqual(cs_no, fc.away_scores, places=3)

        or_over = model.probability(
            Fix(), Mkt('GAIS or Over 2.5', '', '82'), Out('Yes', 1.40), Market.OTHER)
        self.assertAlmostEqual(or_over, fc.away_or_o25, places=3)

    def test_two_up_needs_favourite_80(self):
        heavy = Forecast(
            ph=.82, pd=.12, pa=.06, lam=2.1, mu=0.7, o15=.9, o25=.65, btts=.5,
            home_scores=.9, away_scores=.5, home_or_o25=.92, away_or_o25=.45,
            home_either_half=.85, away_either_half=.4,
            corners_lam=5, corners_mu=4, shots_lam=14, shots_mu=10, sot_lam=5, sot_mu=3.5,
            league_key='premier league', covered=True,
        )
        mid = Forecast(
            ph=.72, pd=.16, pa=.12, lam=1.8, mu=0.9, o15=.85, o25=.55, btts=.5,
            home_scores=.85, away_scores=.58, home_or_o25=.88, away_or_o25=.5,
            home_either_half=.78, away_either_half=.45,
            corners_lam=5, corners_mu=4, shots_lam=13, shots_mu=11, sot_lam=4.5, sot_mu=3.5,
            league_key='premier league', covered=True,
        )
        home_2up = selection(
            marketId='1', marketName='1X2 - 2UP', selectionName='Home',
            specifier='', supportedMarket=Market.HOME, confidence=82, probability=.82, odds=1.22,
        )
        away_2up = selection(
            marketId='1', marketName='1X2 - 2UP', selectionName='Away',
            specifier='', supportedMarket=Market.AWAY, confidence=80, probability=.80, odds=1.30,
        )
        plain = selection(
            marketId='1', marketName='1X2', selectionName='Home',
            specifier='', supportedMarket=Market.HOME, confidence=82, probability=.82, odds=1.22,
        )
        self.assertTrue(statsman_market_allowed('1', '1X2 - 2UP', '', 'Home'))
        self.assertFalse(statsman_market_allowed('1', '1X2 - 2UP', '', 'Draw'))
        self.assertFalse(statsman_market_allowed('1', '1X2', '', 'Home'))
        self.assertTrue(keep_statsman_pick(home_2up, heavy))
        self.assertFalse(keep_statsman_pick(away_2up, heavy))
        self.assertFalse(keep_statsman_pick(home_2up, mid))  # 72% < 80%
        self.assertFalse(keep_statsman_pick(plain, heavy))

    def test_shots_soft_line_allows_nearby_sporty_overs(self):
        """When soft O20.5 / O7.5 maps ≥85%, Sporty O21.5–O23.5 (SOT +1…+3) may pass."""
        fc = Forecast(
            ph=.55, pd=.25, pa=.2, lam=1.6, mu=1.2, o15=.78, o25=.5, btts=.55,
            home_scores=.8, away_scores=.7, home_or_o25=.75, away_or_o25=.6,
            home_either_half=.65, away_either_half=.55,
            corners_lam=5.5, corners_mu=4.5,
            # Match shots λ≈27 → O20.5 ~89%; O22.5 actual map can sit under 76%.
            shots_lam=14.0, shots_mu=13.0, sot_lam=5.8, sot_mu=5.2,
            league_key='premier league', covered=True,
        )
        soft = over_prob(fc.shots_lam + fc.shots_mu, 20.5) * 100
        self.assertGreaterEqual(soft, 85.0)
        near = selection(
            marketId='200', marketName='Total shots', selectionName='Over 22.5',
            specifier='total=22.5', supportedMarket=Market.OTHER,
            confidence=68, probability=.68, odds=1.22,
        )
        self.assertTrue(keep_statsman_pick(near, fc))
        too_far = selection(
            marketId='200', marketName='Total shots', selectionName='Over 24.5',
            specifier='total=24.5', supportedMarket=Market.OTHER,
            confidence=55, probability=.55, odds=1.30,
        )
        self.assertFalse(keep_statsman_pick(too_far, fc))
        sot_soft = over_prob(fc.sot_lam + fc.sot_mu, 7.5) * 100
        self.assertGreaterEqual(sot_soft, 85.0)
        sot_near = selection(
            marketId='201', marketName='Total shots on target', selectionName='Over 9.5',
            specifier='total=9.5', supportedMarket=Market.OTHER,
            confidence=60, probability=.60, odds=1.28,
        )
        self.assertTrue(keep_statsman_pick(sot_near, fc))

    def test_team_over_15_needs_favourite_70(self):
        heavy = Forecast(
            ph=.72, pd=.16, pa=.12, lam=1.9, mu=0.9, o15=.88, o25=.62, btts=.55,
            home_scores=.88, away_scores=.58, home_or_o25=.9, away_or_o25=.5,
            home_either_half=.8, away_either_half=.45,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='premier league', covered=True,
        )
        mid = Forecast(
            ph=.68, pd=.18, pa=.14, lam=1.7, mu=1.0, o15=.82, o25=.55, btts=.52,
            home_scores=.84, away_scores=.62, home_or_o25=.86, away_or_o25=.52,
            home_either_half=.76, away_either_half=.48,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            league_key='premier league', covered=True,
        )
        home_o15 = selection(
            marketId='19', marketName='Home team total goals', selectionName='Over 1.5',
            specifier='total=1.5', supportedMarket=Market.OTHER, confidence=55, probability=.55,
        )
        away_o15 = selection(
            marketId='20', marketName='Away team total goals', selectionName='Over 1.5',
            specifier='total=1.5', supportedMarket=Market.OTHER, confidence=80, probability=.80,
        )
        # Favourite ≥70% unlocks that side's team O1.5 (no map floor).
        self.assertTrue(keep_statsman_pick(home_o15, heavy))
        self.assertFalse(keep_statsman_pick(away_o15, heavy))
        # Strong but under 70% — team O1.5 still blocked.
        self.assertFalse(keep_statsman_pick(home_o15, mid))
        # Match O1.5 stays on the goals ≥76% path.
        match_o15 = selection(
            marketId='18', marketName='Over/Under', selectionName='Over 1.5',
            specifier='total=1.5', supportedMarket=Market.OVER_1_5, confidence=80, probability=.80,
        )
        self.assertTrue(keep_statsman_pick(match_o15, mid))

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
        # 1·over map floor is 70% (not 76%).
        mid = selection(
            marketId='x', marketName='Home or Over 2.5', selectionName='Yes',
            specifier='', supportedMarket=Market.OTHER, confidence=71, probability=.71,
        )
        self.assertTrue(keep_statsman_pick(mid, fc))
        soft = selection(
            marketId='x', marketName='Home or Over 2.5', selectionName='Yes',
            specifier='', supportedMarket=Market.OTHER, confidence=50, probability=.50,
        )
        self.assertFalse(keep_statsman_pick(soft, fc))
        # Win either half: strong side only — no map floor.
        weh = selection(
            marketId='50', marketName='Home win either half', selectionName='Yes',
            specifier='', supportedMarket=Market.OTHER, confidence=55, probability=.55,
        )
        self.assertTrue(keep_statsman_pick(weh, fc))

    def test_cards_count_floor_and_tackles_banned(self):
        from app.tools.statsman_picks import removed_specialty_market
        fc = Forecast(
            ph=.55, pd=.25, pa=.2, lam=1.5, mu=1.1, o15=.72, o25=.48, btts=.5,
            home_scores=.75, away_scores=.65, home_or_o25=.7, away_or_o25=.55,
            home_either_half=.6, away_either_half=.5,
            corners_lam=5, corners_mu=4, shots_lam=12, shots_mu=10, sot_lam=4, sot_mu=3,
            cards_lam=2.2, cards_mu=2.0, league_key='premier league', covered=True,
        )
        cards = selection(
            marketId='139', marketName='Total cards', selectionName='Over 3.5',
            specifier='total=3.5', supportedMarket=Market.OTHER, confidence=80, probability=.8,
        )
        exact = selection(
            marketId='450004', marketName='Excluded Goals', selectionName='2',
            specifier='', supportedMarket=Market.OTHER, confidence=45, probability=.45,
        )
        self.assertTrue(statsman_market_allowed(cards.marketId, cards.marketName, cards.specifier, cards.selectionName))
        self.assertTrue(statsman_market_allowed(exact.marketId, exact.marketName, '', exact.selectionName))
        self.assertTrue(keep_statsman_pick(cards, fc))
        self.assertTrue(keep_statsman_pick(exact, fc))
        self.assertTrue(removed_specialty_market('900622', 'Total goal kicks', 'Over 15.5'))
        self.assertTrue(removed_specialty_market('900614', 'Total tackles', 'Over 20.5'))
        self.assertFalse(statsman_market_allowed('900622', 'Total goal kicks', 'total=15.5', 'Over 15.5'))
        self.assertFalse(keep_statsman_pick(selection(
            marketId='450004', marketName='Excluded Goals', selectionName='2',
            supportedMarket=Market.OTHER, confidence=32, probability=.32,
        ), fc))

    def test_filter_uncovered_keeps_short_goals_only(self):
        model = StatsmanModel(DATA) if (DATA / 'E0.csv').exists() else None
        if model is None:
            self.skipTest('no data')
        # Long-priced O1.5 on uncovered league → book implied under floor → drop.
        long = selection(
            homeTeam='Unknown FC', awayTeam='Ghost Utd', league='Fantasy League',
            confidence=90, odds=1.50, probability=.90,
        )
        # Short O1.5 on uncovered league → keep via book implied.
        short = selection(
            homeTeam='Unknown FC', awayTeam='Ghost Utd', league='Fantasy League',
            confidence=90, odds=1.18, probability=.90,
        )
        kept = apply_statsman_ticket_filter([long, short], model)
        self.assertEqual([s.odds for s in kept], [1.18])

    def test_exclusive_list_markets_use_statsman_probabilities(self):
        model = StatsmanModel(DATA) if (DATA / 'E0.csv').exists() else None
        if model is None:
            self.skipTest('no data')

        class _M:
            marketId = ''
            marketName = ''
            specifier = ''

        class _O:
            outcomeId = '12'
            outcomeName = ''
            odds = 1.25

        class _F:
            eventId = 'pl1'
            homeTeam = 'Arsenal'
            awayTeam = 'Chelsea'
            league = 'England Premier League'

        from app.schemas import Market as M
        cases = [
            ('18', 'Over/Under', 'total=2.5', 'Over 2.5', M.OVER_2_5),
            ('19', 'Home team total goals', 'total=1.5', 'Over 1.5', M.OTHER),
            ('20', 'Away team over/under', 'total=0.5', 'Over 0.5', M.OTHER),
            ('10', 'Double Chance', '', '1X', M.DOUBLE_CHANCE_1X),
            ('139', 'Total cards', 'total=3.5', 'Over 3.5', M.OTHER),
            ('166', 'Total corners', 'total=9.5', 'Over 9.5', M.OTHER),
            ('450004', 'Excluded Goals', '', '2', M.OTHER),
            ('19', 'Home team total goals', 'total=0.5', 'Over 0.5', M.OTHER),
        ]
        for market_id, mname, spec, oname, supported in cases:
            with self.subTest(market=mname):
                self.assertTrue(statsman_market_allowed(market_id, mname, spec, oname))
                m, o = _M(), _O()
                m.marketId, m.marketName, m.specifier = market_id, mname, spec
                o.outcomeName = oname
                if market_id == '10':
                    o.outcomeId = '9'
                p = model.probability(_F(), m, o, supported)
                # Must be engine-priced (not ~1/1.25 bookmaker fallback for covered clubs).
                self.assertNotAlmostEqual(p, 1 / 1.25, places=3)
                self.assertGreater(p, 0.01)
                self.assertLess(p, 0.999)


if __name__ == '__main__':
    unittest.main()

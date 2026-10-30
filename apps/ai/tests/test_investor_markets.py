import unittest

from app.generation import generate_report
from app.investor_markets import investor_market_allowed
from app.schemas import Config, Market
from test_flexible_generation import selection


def allowed(market_id, name, specifier, outcome):
    return investor_market_allowed(market_id, name, specifier, outcome)


class InvestorMarketTests(unittest.TestCase):
    def test_fixed_list_accepts_the_named_families(self):
        cases = [
            ('1', '1X2', '', 'Home'),
            ('1', '1X2', '', 'Draw'),
            ('1', '1X2', '', 'Away'),
            ('10', 'Double Chance', '', '1X'),
            ('10', 'Double Chance', '', 'X2'),
            ('10', 'Double Chance', '', '12'),
            ('18', 'Over/Under', 'total=0.5', 'Over 0.5'),
            ('18', 'Over/Under', 'total=1.5', 'Under 1.5'),
            ('18', 'Over/Under', 'total=2.5', 'Over 2.5'),
            ('18', 'Over/Under', 'total=3.5', 'Under 3.5'),
            ('60', '1st half - 1x2', '', 'Draw'),
            ('47', 'Halftime/Fulltime', '', 'Home/Draw'),
            ('50', 'Home win either half', '', 'Yes'),
            ('51', 'Away to win either half', '', 'No'),
            ('882', 'Player to score', 'player=sr:1', 'Yes'),
            ('882', 'Player to score', 'player=sr:1', 'No'),
            ('900', 'Team to lead by 3 goals in a row', '', 'Yes'),
            ('166', 'Total corners', 'total=9.5', 'Over 9.5'),
            ('167', 'Home team total corners', 'total=4.5', 'Under 4.5'),
            ('200', 'Total shots', 'total=20.5', 'Over 20.5'),
            ('201', 'Total shots on target', 'total=8.5', 'Under 8.5'),
            ('21', 'Excluded number of goals', '', '2'),
            ('21', 'Exact goals', '', '3'),
            ('150', 'Total goal kicks', 'total=15.5', 'Over 15.5'),
        ]
        for case in cases:
            with self.subTest(market=case[1], outcome=case[3]):
                self.assertTrue(allowed(*case))

    def test_other_markets_and_goal_lines_are_left_out(self):
        rejected = [
            ('29', 'Both teams to score', '', 'Yes'),
            ('18', 'Over/Under', 'total=4.5', 'Over 4.5'),
            ('68', '1st half - total', 'total=1.5', 'Over 1.5'),
            ('162', 'Corners 1x2', '', 'Home'),
            ('139', 'Total bookings', 'total=4.5', 'Over 4.5'),
            ('16', 'Handicap', 'hcp=0:1', 'Home'),
            ('38', 'Anytime goalscorer', '', 'Haaland'),
            ('29', 'Home team to score', '', 'Yes'),
            ('48', 'Home to win both halves', '', 'Yes'),
        ]
        for case in rejected:
            with self.subTest(market=case[1]):
                self.assertFalse(allowed(*case))

    def test_investor_search_drops_markets_outside_the_list(self):
        pool = [
            selection(1, 1.4, .7, market='29', outcome='yes', supported=Market.BTTS_YES, marketName='Both teams to score', selectionName='Yes'),
            selection(2, 1.4, .7, marketName='1X2', selectionName='Home'),
            selection(3, 1.35, .72, market='10', outcome='9', supported=Market.DOUBLE_CHANCE_1X, marketName='Double Chance', selectionName='1X'),
        ]
        report = generate_report(pool, Config(numberOfSlips=1, riskMode='INVESTOR', riskPreference='VERY_LOW', minimumOdds=1.1, maximumOdds=5, minimumSelections=1, maximumSelections=1), [])
        used = {s['marketName'] for c in report['candidates'] for s in c['selections']}
        self.assertTrue(used)
        self.assertTrue(used <= {'1X2', 'Double Chance'})
        self.assertNotIn('Both teams to score', used)

    def test_a_booked_investor_ticket_keeps_its_original_market(self):
        pool = [selection(1, 1.4, .7, market='29', outcome='yes', supported=Market.BTTS_YES, marketName='Both teams to score', selectionName='Yes')]
        report = generate_report(pool, Config(numberOfSlips=1, riskMode='INVESTOR', fixtureMode='original_only', preserveOriginalSelections=True, minimumOdds=1.1, maximumOdds=None, minimumSelections=1, maximumSelections=1), [])
        self.assertEqual(report['candidates'][0]['selections'][0]['marketName'], 'Both teams to score')


if __name__ == '__main__':
    unittest.main()

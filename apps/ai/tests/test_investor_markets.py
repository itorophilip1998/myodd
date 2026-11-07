import unittest

from app.tools.generation import generate_report
from app.tools.investor_markets import investor_market_allowed
from app.schemas import Config, Market
from test_flexible_generation import selection


def allowed(market_id, name, specifier, outcome):
    return investor_market_allowed(market_id, name, specifier, outcome)


class InvestorMarketTests(unittest.TestCase):
    def test_fixed_list_accepts_the_named_families(self):
        cases = [
            ('21', 'Exact goals', '', '2'),
            ('21', 'Home team exact goals', '', '1'),
            ('21', 'Away team exact goals', '', '0'),
            ('139', 'Total cards', 'total=4.5', 'Over 4.5'),
            ('140', 'Home team total bookings', 'total=2.5', 'Over 2.5'),
            ('141', 'Away team cards', 'total=2.5', 'Over 2.5'),
            ('166', 'Total corners', 'total=9.5', 'Over 9.5'),
            ('167', 'Home team total corners', 'total=4.5', 'Over 4.5'),
            ('168', 'Away team total corners', 'total=5.5', 'Over 5.5'),
            ('18', 'Over/Under', 'total=2.5', 'Over 2.5'),
            ('18', 'Over/Under', 'total=4.5', 'Over 4.5'),
            ('18', 'Over/Under', 'total=5.5', 'Over 5.5'),
            ('18', 'Over/Under', 'total=3.5', 'Over 3.5'),
            ('18', 'Over/Under', 'total=1.5', 'Over 1.5'),
            ('19', 'Home team total goals', 'total=1.5', 'Over 1.5'),
            ('20', 'Away team over/under', 'total=1.5', 'Over 1.5'),
            ('10', 'Double Chance', '', '1X'),
            ('10', 'Double Chance', '', 'X2'),
            ('10', 'Double Chance', '', '12'),
        ]
        for case in cases:
            with self.subTest(market=case[1], outcome=case[3]):
                self.assertTrue(allowed(*case))

    def test_statsman_ticket_markets_are_accepted(self):
        cases = [
            ('81', 'Home or over 2.5', '', 'Yes'),
            ('82', 'Away or over 2.5', '', 'Yes'),
            ('81', 'Arsenal or Over 2.5', '', 'Yes'),
            ('82', 'Chelsea or Over 2.5', '', 'Yes'),
            ('200', 'Total shots', 'total=20.5', 'Over 20.5'),
            ('201', 'Total shots on target', 'total=8.5', 'Under 8.5'),
            ('202', 'Home team total shots', 'total=11.5', 'Over 11.5'),
            ('29', 'Both teams to score', '', 'Yes'),
            ('50', 'Home win either half', '', 'Yes'),
            ('19', 'Home team total goals', 'total=0.5', 'Over 0.5'),
            ('x', 'Away team clean sheet', '', 'No'),
        ]
        for case in cases:
            with self.subTest(market=case[1], outcome=case[3]):
                self.assertTrue(allowed(*case))

    def test_other_markets_are_left_out(self):
        rejected = [
            ('85', 'Draw or over 2.5', '', 'Yes'),
            ('1', '1X2', '', 'Home'),
            ('60', '1st half - 1x2', '', 'Draw'),
            ('47', 'Halftime/Fulltime', '', 'Home/Draw'),
            ('882', 'Player to score', 'player=sr:1', 'Yes'),
            ('162', 'Corners 1x2', '', 'Home'),
            ('68', '1st half - total', 'total=1.5', 'Over 1.5'),
            ('16', 'Handicap', 'hcp=0:1', 'Home'),
            ('38', 'Anytime goalscorer', '', 'Haaland'),
            ('81', 'Home or over 2.5', '', 'No'),
            ('81', 'Home or under 2.5', '', 'Yes'),
            ('81', 'Home or over 1.5', '', 'Yes'),
            ('81', 'Home or draw or over 2.5', '', 'Yes'),
            ('150', 'Total goal kicks', 'total=15.5', 'Over 15.5'),
            ('900614', 'Total tackles', 'total=20.5', 'Over 20.5'),
            ('18', 'Over/Under', 'total=2.5', 'Under 2.5'),
            ('18', 'Over/Under', 'total=1.5', 'Under 1.5'),
            ('19', 'Home team total goals', 'total=0.5', 'Under 0.5'),
            ('20', 'Away team over/under', 'total=1.5', 'Under 1.5'),
            ('166', 'Total corners', 'total=3.5', 'Under 3.5'),
            ('167', 'Home team total corners', 'total=4.5', 'Under 4.5'),
            ('168', 'Away team total corners', 'total=5.5', 'Under 5.5'),
            ('139', 'Total cards', 'total=4.5', 'Under 4.5'),
            ('140', 'Home team total bookings', 'total=2.5', 'Under 2.5'),
            ('141', 'Away team cards', 'total=2.5', 'Under 2.5'),
        ]
        for case in rejected:
            with self.subTest(market=case[1]):
                self.assertFalse(allowed(*case))

    def test_investor_and_gambler_search_drop_raw_1x2(self):
        pool = [
            selection(1, 1.3, .7, market='1', outcome='1', supported=Market.HOME, marketName='1X2', selectionName='Home'),
            selection(2, 1.3, .7, market='10', outcome='9', supported=Market.DOUBLE_CHANCE_1X, marketName='Double Chance', selectionName='1X'),
            selection(3, 1.35, .72, market='29', outcome='yes', supported=Market.BTTS_YES, marketName='Both teams to score', selectionName='Yes'),
        ]
        for mode in ('INVESTOR', 'GAMBLER'):
            with self.subTest(mode=mode):
                report = generate_report(pool, Config(numberOfSlips=1, riskMode=mode, riskPreference='VERY_LOW', minimumOdds=1.1, maximumOdds=20, minimumSelections=1, maximumSelections=1), [])
                used = {s['marketName'] for c in report['candidates'] for s in c['selections']}
                self.assertNotIn('1X2', used)
                self.assertTrue(used & {'Double Chance', 'Both teams to score'})

    def test_a_booked_investor_ticket_keeps_its_original_market(self):
        pool = [selection(1, 1.3, .7, market='29', outcome='yes', supported=Market.BTTS_YES, marketName='Both teams to score', selectionName='Yes')]
        report = generate_report(pool, Config(numberOfSlips=1, riskMode='INVESTOR', fixtureMode='original_only', preserveOriginalSelections=True, minimumOdds=1.1, maximumOdds=None, minimumSelections=1, maximumSelections=1), [])
        self.assertEqual(report['candidates'][0]['selections'][0]['marketName'], 'Both teams to score')


if __name__ == '__main__':
    unittest.main()

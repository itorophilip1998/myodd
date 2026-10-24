"""Target odds + sure/safer slang parsing."""
import unittest

from app.intent import parse_rules
from app.odds_format import extract_odds_bounds, has_safer_slang
from app.schemas import Market


class TargetOddsTests(unittest.TestCase):
    def test_around_uses_tight_band(self):
        self.assertEqual(extract_odds_bounds('around 5 odds'), (4.5, 5.5))

    def test_about_and_sure_target(self):
        self.assertEqual(extract_odds_bounds('about 5'), (4.5, 5.5))
        self.assertEqual(extract_odds_bounds('sure 5 odds'), (4.5, 5.5))
        self.assertEqual(extract_odds_bounds('safe 10'), (9.5, 10.5))

    def test_bare_n_odds(self):
        self.assertEqual(extract_odds_bounds('give me 5 odds'), (4.5, 5.5))

    def test_range_still_wins(self):
        self.assertEqual(extract_odds_bounds('between 3 and 5 odds'), (3.0, 5.0))
        self.assertEqual(extract_odds_bounds('only 4-5 odds'), (4.0, 5.0))

    def test_safer_slang_detected(self):
        self.assertTrue(has_safer_slang('sure 5 odds'))
        self.assertTrue(has_safer_slang('banker picks please'))
        self.assertTrue(has_safer_slang('safer tickets'))
        self.assertFalse(has_safer_slang('aggressive high risk'))


class SurePromptRulesTests(unittest.TestCase):
    def test_sure_five_odds_investor(self):
        config = parse_rules(
            'sure 5 odds\nFinal request settings (take precedence): Risk mode: Investor Mode.'
        )
        self.assertEqual(config.riskMode, 'INVESTOR')
        self.assertEqual((config.minimumOdds, config.maximumOdds), (2, 5))
        self.assertEqual(config.markets, [])
        self.assertTrue(any('not a guaranteed' in n.casefold() or 'requested odds were not applied' in n.casefold()
                            for n in config.unhandledRequests))

    def test_sure_maps_risk_preference_before_mode(self):
        # Without a named mode footer, default investor still applies VERY_LOW.
        config = parse_rules('sure banker tickets around 5')
        self.assertEqual(config.riskMode, 'INVESTOR')
        self.assertEqual(config.riskPreference, 'VERY_LOW')
        self.assertEqual((config.minimumOdds, config.maximumOdds), (4.5, 5.0))
        self.assertIn(Market.HOME, config.markets)


if __name__ == '__main__':
    unittest.main()

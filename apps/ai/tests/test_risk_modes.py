import unittest
from unittest.mock import patch
from app.intent import parse_intent, parse_rules
from app.schemas import Config
from app.generation import generate_report
from test_flexible_generation import selection

class RiskModeTests(unittest.TestCase):
    def test_named_modes_enforce_per_ticket_odds_bands(self):
        for name, preference, low, high in [('Investor Mode', 'VERY_LOW', 2, 5), ('Investor modes', 'VERY_LOW', 2, 5), ('Gamler Mode', 'MODERATE', 5.01, 20), ('Gambler Mode', 'MODERATE', 5.01, 20), ('Japa Mode', 'HIGHER', 20.01, 100), ('Lagoslife Mode', 'VERY_HIGH', 100.01, None)]:
            with self.subTest(mode=name):
                config = parse_rules(f'Create 4 codes. Exclude Chelsea. {name}')
                self.assertEqual(config.riskPreference, preference)
                self.assertEqual((config.minimumOdds, config.maximumOdds, config.numberOfSlips), (low, high, 4))
                self.assertIn('Chelsea', config.excludedTeams)
    def test_conflicting_typed_mode_range_is_explained(self):
        from app.risk_modes import ModeConstraintError
        with self.assertRaises(ModeConstraintError):
            parse_rules('Investor Mode between 100 and 500 odds')
    def test_lagoslife_has_no_artificial_million_odds_ceiling(self):
        config = parse_rules('Lagoslife Mode')
        # Per-leg Lagoslife cap is 2.00; high ticket odds come from many safe legs.
        pool = [selection(event, odds=2.0, probability=.45) for event in range(40)]
        config.numberOfSlips = 1
        config.minimumSelections = 20
        config.maximumSelections = 30
        candidate = generate_report(pool, config, [])['candidates'][0]
        self.assertGreater(candidate['totalOdds'], 1000000)
        self.assertTrue(all(s['odds'] <= 2 for s in candidate['selections']))
    @patch('app.intent._parse_intent', return_value=Config())
    def test_saved_preferences_apply_only_to_unspecified_settings(self, _):
        result = parse_intent('Please make my next collection', [], {'riskMode': 'GAMBLER', 'ticketCount': 7, 'gamesPerTicket': 4})
        self.assertEqual((result.numberOfSlips, result.minimumSelections, result.minimumOdds, result.maximumOdds), (7, 4, 5.01, 20))
    def test_final_selection_overrides_earlier_mode(self):
        config = parse_rules('Investor Mode. Final request settings (take precedence): Risk mode: Lagos-Lifes Mode.')
        self.assertEqual(config.riskPreference, 'VERY_HIGH')
    @patch('app.intent._parse_intent', return_value=Config(riskPreference='LOWER'))
    def test_keywords_are_applied_after_provider_interpretation(self, _):
        self.assertEqual(parse_intent('Japa Mode').riskPreference, 'HIGHER')
    def test_conservative_and_high_modes_rank_real_candidates_differently(self):
        pool = [selection(event, odds, .96 / odds, outcome=str(i)) for event in range(5) for i, odds in enumerate([1.5, 2, 3])]
        values = {}
        for mode in ['VERY_LOW', 'MODERATE', 'HIGHER', 'VERY_HIGH']:
            config = Config(numberOfSlips=1, minimumOdds=2, maximumOdds=5, minimumSelections=2, maximumSelections=2, riskPreference=mode, excludedTeams=['Home 4'])
            candidate = generate_report(pool, config, [])['candidates'][0]
            values[mode] = candidate['totalOdds']
            self.assertTrue(2 <= candidate['totalOdds'] <= 5)
            self.assertTrue(all(s['homeTeam'] != 'Home 4' for s in candidate['selections']))
        self.assertLessEqual(values['VERY_LOW'], values['VERY_HIGH'])

    def test_unset_mode_defaults_to_investor(self):
        config = parse_rules('Create 4 codes. Exclude Chelsea.')
        self.assertEqual((config.riskMode, config.riskPreference, config.minimumOdds, config.maximumOdds), ('INVESTOR', 'VERY_LOW', 2, 5))

    def test_compact_odds_tokens_are_parsed(self):
        config = parse_rules('Create 3 codes between 2ks and 5ks using Lagoslife Mode')
        self.assertEqual((config.minimumOdds, config.maximumOdds), (2000, 5000))
        from app.odds_format import format_odds, parse_odds_token
        self.assertEqual(format_odds(184775.21), '185ks')
        self.assertEqual(parse_odds_token('1.5ms'), 1.5e6)

    def test_named_modes_enforce_safe_per_game_odds(self):
        from app.odds_policy import within_mode_selection_odds
        self.assertTrue(within_mode_selection_odds(1.5, 'INVESTOR'))
        self.assertFalse(within_mode_selection_odds(1.51, 'INVESTOR'))
        self.assertTrue(within_mode_selection_odds(1.8, 'GAMBLER'))
        self.assertFalse(within_mode_selection_odds(1.81, 'GAMBLER'))
        self.assertTrue(within_mode_selection_odds(2.0, 'JAPA'))
        self.assertFalse(within_mode_selection_odds(2.01, 'JAPA'))
        pool = [selection(event, odds, .9 / odds) for event in range(6) for odds in (1.4, 1.7, 2.2)]
        config = parse_rules('Investor Mode')
        config.numberOfSlips = 1
        config.minimumSelections = 2
        config.maximumSelections = 3
        candidate = generate_report(pool, config, [])['candidates'][0]
        self.assertTrue(all(1.1 <= s['odds'] <= 1.5 for s in candidate['selections']))
        self.assertTrue(2 <= candidate['totalOdds'] <= 5)

    def test_shorthand_odds_and_games_are_honored_under_investor(self):
        prompt = 'please give me only 4- 5 odds your best options make it 10 games not bellow 4 odds please\nFinal request settings (take precedence): Risk mode: Investor Mode.'
        config = parse_rules(prompt)
        self.assertEqual((config.riskMode, config.minimumOdds, config.maximumOdds), ('INVESTOR', 4, 5))
        self.assertEqual((config.minimumSelections, config.maximumSelections), (10, 10))

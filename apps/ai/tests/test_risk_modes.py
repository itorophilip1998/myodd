import unittest
from unittest.mock import patch
from app.intent import parse_intent, parse_rules
from app.schemas import Config
from app.generation import generate_report
from test_flexible_generation import selection

class RiskModeTests(unittest.TestCase):
    def test_named_modes_enforce_per_ticket_odds_bands(self):
        for name, preference, low, high in [('Investor Mode', 'VERY_LOW', 1, 10), ('Investor modes', 'VERY_LOW', 1, 10), ('Gamler Mode', 'MODERATE', 10.01, 100), ('Gambler Mode', 'MODERATE', 10.01, 100), ('Japa Mode', 'HIGHER', 100.01, 500), ('Lagoslife Mode', 'VERY_HIGH', 500.01, None)]:
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
        pool = [selection(event, odds=20, probability=.04) for event in range(8)]
        config.numberOfSlips = 1
        candidate = generate_report(pool, config, [])['candidates'][0]
        self.assertGreater(candidate['totalOdds'], 1000000)
    @patch('app.intent._parse_intent', return_value=Config())
    def test_saved_preferences_apply_only_to_unspecified_settings(self, _):
        result = parse_intent('Please make my next collection', [], {'riskMode': 'GAMBLER', 'ticketCount': 7, 'gamesPerTicket': 4})
        self.assertEqual((result.numberOfSlips, result.minimumSelections, result.minimumOdds, result.maximumOdds), (7, 4, 10.01, 100))
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
            config = Config(numberOfSlips=1, minimumOdds=2, maximumOdds=10, minimumSelections=2, maximumSelections=2, riskPreference=mode, excludedTeams=['Home 4'])
            candidate = generate_report(pool, config, [])['candidates'][0]
            values[mode] = candidate['totalOdds']
            self.assertTrue(2 <= candidate['totalOdds'] <= 10)
            self.assertTrue(all(s['homeTeam'] != 'Home 4' for s in candidate['selections']))
        self.assertLess(values['VERY_LOW'], values['VERY_HIGH'])

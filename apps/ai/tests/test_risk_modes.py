import unittest
from unittest.mock import patch
from app.tools.intent import parse_intent, parse_rules
from app.schemas import Config
from app.tools.generation import generate_report
from test_flexible_generation import selection

class RiskModeTests(unittest.TestCase):
    def test_named_modes_enforce_per_ticket_odds_bands(self):
        for name, preference, low, high, slips in [('Investor Mode', 'VERY_LOW', 3, 6, 10), ('Investor modes', 'VERY_LOW', 3, 6, 10), ('Gamler Mode', 'MODERATE', 6.1, 20, 10), ('Gambler Mode', 'MODERATE', 6.1, 20, 10), ('Japa Mode', 'HIGHER', 20.01, 100, 4), ('Lagoslife Mode', 'VERY_HIGH', 100, None, 4)]:
            with self.subTest(mode=name):
                config = parse_rules(f'Create 4 codes. Exclude Chelsea. {name}')
                self.assertEqual(config.riskPreference, preference)
                self.assertEqual((config.minimumOdds, config.maximumOdds, config.numberOfSlips), (low, high, slips))
                self.assertIn('Chelsea', config.excludedTeams)
                if name.startswith('Investor'):
                    self.assertEqual((config.minimumSelections, config.maximumSelections, config.markets), (1, 50, []))
    def test_conflicting_typed_mode_range_is_explained(self):
        from app.tools.risk_modes import ModeConstraintError
        gambler = parse_rules('Gambler Mode between 100 and 500 odds')
        self.assertEqual((gambler.minimumOdds, gambler.maximumOdds), (6.1, 20))
        investor = parse_rules('Investor Mode between 100 and 500 odds')
        self.assertEqual((investor.minimumOdds, investor.maximumOdds), (3, 6))
        self.assertTrue(any('fixed ticket odds' in note for note in investor.unhandledRequests))
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
    @patch('app.tools.intent._parse_intent', return_value=Config())
    def test_saved_preferences_apply_only_to_unspecified_settings(self, _):
        result = parse_intent('Please make my next collection', [], {'riskMode': 'GAMBLER', 'ticketCount': 7, 'gamesPerTicket': 4})
        self.assertEqual((result.numberOfSlips, result.minimumSelections, result.minimumOdds, result.maximumOdds), (10, 1, 6.1, 20))
    def test_final_selection_overrides_earlier_mode(self):
        config = parse_rules('Investor Mode. Final request settings (take precedence): Risk mode: Lagos-Lifes Mode.')
        self.assertEqual(config.riskPreference, 'VERY_HIGH')
    @patch('app.tools.intent._parse_intent', return_value=Config(riskPreference='LOWER'))
    def test_keywords_are_applied_after_provider_interpretation(self, _):
        self.assertEqual(parse_intent('Japa Mode').riskPreference, 'HIGHER')
    def test_all_risk_modes_keep_random_targets_within_explicit_bounds_and_filters(self):
        pool = [selection(event, odds, .96 / odds, outcome=str(i)) for event in range(5) for i, odds in enumerate([1.5, 2, 3])]
        values = {}
        for mode in ['VERY_LOW', 'MODERATE', 'HIGHER', 'VERY_HIGH']:
            config = Config(numberOfSlips=1, minimumOdds=2, maximumOdds=5, minimumSelections=2, maximumSelections=2, riskPreference=mode, excludedTeams=['Home 4'])
            candidate = generate_report(pool, config, [])['candidates'][0]
            values[mode] = candidate['totalOdds']
            self.assertTrue(2 <= candidate['totalOdds'] <= 5)
            self.assertTrue(all(s['homeTeam'] != 'Home 4' for s in candidate['selections']))
        # Each mode now samples its own target; independent random draws need not be ordered.
        self.assertTrue(all(2 <= odds <= 5 for odds in values.values()))

    def test_unset_mode_defaults_to_investor(self):
        config = parse_rules('Create 4 codes. Exclude Chelsea.')
        self.assertEqual((config.riskMode, config.riskPreference, config.minimumOdds, config.maximumOdds), ('INVESTOR', 'VERY_LOW', 3, 6))

    def test_compact_odds_tokens_are_parsed(self):
        config = parse_rules('Create 3 codes between 2ks and 5ks using Lagoslife Mode')
        self.assertEqual((config.minimumOdds, config.maximumOdds), (2000, 5000))
        from app.tools.odds_format import format_odds, parse_odds_token
        self.assertEqual(format_odds(184775.21), '185k')
        self.assertEqual(format_odds(1e6), '1m')
        self.assertEqual(format_odds(999500), '1m')
        self.assertEqual(parse_odds_token('1.5m'), 1.5e6)
        self.assertEqual(parse_odds_token('1.5ms'), 1.5e6)

    def test_named_modes_enforce_safe_per_game_odds(self):
        from app.tools.odds_policy import within_mode_selection_odds
        self.assertTrue(within_mode_selection_odds(1.35, 'INVESTOR'))
        self.assertFalse(within_mode_selection_odds(1.36, 'INVESTOR'))
        self.assertTrue(within_mode_selection_odds(1.35, 'GAMBLER'))
        self.assertFalse(within_mode_selection_odds(1.36, 'GAMBLER'))
        self.assertTrue(within_mode_selection_odds(2.0, 'JAPA'))
        self.assertFalse(within_mode_selection_odds(2.01, 'JAPA'))
        pool = [selection(event, odds, .9 / odds, market='18', marketName='Over/Under', selectionName='Over 1.5') for event in range(6) for odds in (1.35, 1.5, 2.2)]
        config = parse_rules('Investor Mode')
        config.numberOfSlips = 1
        config.minimumSelections = 4
        config.maximumSelections = 6
        candidate = generate_report(pool, config, [])['candidates'][0]
        self.assertTrue(all(1.1 <= s['odds'] <= 1.35 for s in candidate['selections']))
        self.assertTrue(3 <= candidate['totalOdds'] <= 6)

    def test_investor_plan_covers_three_four_five_and_six(self):
        pool = [selection(event, price, .95 / price, market='18', outcome=str(index), marketName='Over/Under', selectionName='Over 1.5')
                for event in range(100) for index, price in enumerate((1.1, 1.2, 1.25, 1.26, 1.32))]
        report = generate_report(pool, parse_rules('Investor Mode'), [])
        totals = [c['totalOdds'] for c in report['candidates']]
        self.assertEqual(sum(3 <= total <= 3.10 for total in totals), 3)
        self.assertEqual(sum(3.90 <= total <= 4.10 for total in totals), 3)
        self.assertEqual(sum(4.90 <= total <= 5.10 for total in totals), 2)
        self.assertEqual(sum(5.90 <= total <= 6 for total in totals), 2)
        keys = [(s['eventId'], s['marketId'], s['outcomeId'], s.get('specifier') or '') for c in report['candidates'] for s in c['selections']]
        self.assertEqual(len(keys), len(set(keys)))

    def test_investor_ignores_requested_odds_games_and_markets(self):
        prompt = 'please give me only 4- 5 odds double chance make it 10 games not bellow 4 odds please\nFinal request settings (take precedence): Risk mode: Investor Mode.'
        config = parse_rules(prompt)
        self.assertEqual((config.riskMode, config.riskPreference, config.minimumOdds, config.maximumOdds), ('INVESTOR', 'VERY_LOW', 3, 6))
        self.assertEqual((config.numberOfSlips, config.minimumSelections, config.maximumSelections), (10, 1, 50))
        self.assertEqual(config.markets, [])
        self.assertFalse(config.allowOddsAdjustment)
        self.assertTrue(any('fixed ticket odds' in note for note in config.unhandledRequests))
        self.assertTrue(any('Requested markets' in note for note in config.unhandledRequests))
        self.assertTrue(any('Requested counts' in note for note in config.unhandledRequests))

    def test_investor_system_copy_is_not_a_user_request(self):
        prompt = (
            'Create tickets using my selected settings.\n'
            'Final request settings (take precedence): Investor Mode system ticket. '
            'Choose the markets, ticket count, and games per ticket. '
            'Build 3 tickets near 3, 3 near 4, 2 near 5, and 2 near 6 odds. Each selection between 1.10 and 1.35. '
            'Ignore requested markets, odds, and counts.'
        )
        config = parse_rules(prompt)
        self.assertEqual((config.riskMode, config.minimumOdds, config.maximumOdds, config.numberOfSlips), ('INVESTOR', 3, 6, 10))
        self.assertEqual((config.minimumSelections, config.maximumSelections, config.markets), (1, 50, []))
        self.assertEqual(config.unhandledRequests, [])

    @patch('app.tools.intent._parse_intent', return_value=Config(riskMode='INVESTOR', minimumOdds=2, maximumOdds=5))
    def test_saved_counts_do_not_warn_on_a_plain_investor_request(self, _):
        prompt = (
            'Create tickets for today.\n'
            'Final request settings (take precedence): Investor Mode system ticket. '
            'Build 3 tickets near 3, 3 near 4, 2 near 5, and 2 near 6 odds. Each selection between 1.10 and 1.35.'
        )
        result = parse_intent(prompt, [], {'ticketCount': 4, 'gamesPerTicket': 6})
        self.assertEqual((result.numberOfSlips, result.minimumSelections, result.maximumSelections), (10, 1, 50))
        self.assertEqual((result.minimumOdds, result.maximumOdds), (3, 6))
        self.assertFalse(any('Requested' in note for note in result.unhandledRequests))


class LagoslifeUnlimitedTests(unittest.TestCase):
    def test_custom_large_ranges_and_open_maximum(self):
        for prompt in ['Lagoslife Mode from 100 to 5m odds', 'Lagoslife Mode between 100 and 5,000,000 odds']:
            with self.subTest(prompt=prompt):
                config = parse_rules(prompt)
                self.assertEqual((config.minimumOdds, config.maximumOdds), (100, 5_000_000))
        for prompt, minimum in [('Lagoslife Mode', 100), ('Lagoslife Mode at least 500 odds. No maximum ticket odds.', 500)]:
            config = parse_rules(prompt)
            self.assertEqual((config.minimumOdds, config.maximumOdds), (minimum, None))

    def test_generates_above_five_million_without_a_product_cap(self):
        config = parse_rules('Lagoslife Mode')
        config.numberOfSlips = 1
        config.minimumSelections = config.maximumSelections = 30
        pool = [selection(event, odds=2.0, probability=.45) for event in range(30)]
        candidate = generate_report(pool, config, [])['candidates'][0]
        self.assertGreater(candidate['totalOdds'], 5_000_000)

class SystemOddsMixTests(unittest.TestCase):
    def test_gambler_covers_the_full_band_without_repeating_picks(self):
        import random
        from app.tools.search import search_system_plan, GAMBLER_PLAN, target_odds_window
        pool = [selection(event, price, .95 / price, market='18', outcome=str(i), marketName='Over/Under', selectionName='Over 1.5')
                for event in range(150) for i, price in enumerate((1.1, 1.2, 1.25, 1.26, 1.32))]
        config = parse_rules('Gambler Mode')
        tickets, _ = search_system_plan(pool, config, [], rng=random.Random(42))
        self.assertEqual(len(tickets), 10)
        for target, count in GAMBLER_PLAN:
            low, high = target_odds_window(target, config)
            self.assertEqual(sum(low <= ticket['totalOdds'] <= high for ticket in tickets), count)
        self.assertTrue(all(6.1 <= t['totalOdds'] <= 20 for t in tickets))
        keys = [(s['eventId'], s['marketId'], s['outcomeId'], s['specifier']) for t in tickets for s in t['selections']]
        self.assertEqual(len(keys), len(set(keys)))

    def test_missing_target_is_reported_without_filling_with_lowest_odds(self):
        from unittest.mock import patch
        from app.tools.search import target_odds_window
        config = parse_rules('Investor Mode')
        # All picks at 1.3 cannot reach any narrow target; do not fill using a whole-band fallback.
        pool = [selection(event, 1.3, .7, market='10', marketName='Double Chance', selectionName='1X') for event in range(20)]
        with patch('app.tools.generation.search', side_effect=AssertionError('A system plan must not fall back to low odds')):
            report = generate_report(pool, config, [])
        self.assertEqual(report['candidates'], [])
        self.assertTrue(any('Missing targets' in n for n in report['notices']))

    def test_internal_game_counts_can_exceed_twenty_for_low_priced_legs(self):
        from app.tools.search import target_leg_bounds
        pool = [selection(event, 1.1, .8) for event in range(40)]
        minimum, maximum = target_leg_bounds(pool, 18, 20)
        self.assertGreater(minimum, 20)
        self.assertLessEqual(minimum, maximum)
        self.assertLessEqual(maximum, 50)

import unittest
from app.schemas import Config, Selection
from app.splitting import split_report
from test_flexible_generation import selection

class SplittingTests(unittest.TestCase):
    def setUp(self):
        self.pool = [selection(i, odds=1.2 + i * .1, probability=.9 - i * .03) for i in range(12)]
        self.original = [Selection(**s.model_dump()) for s in self.pool]
        self.config = Config(numberOfSlips=3, minimumOdds=1.1, maximumOdds=1000000, minimumSelections=1, maximumSelections=30, fixtureMode='original_only', riskPreference='VERY_LOW')
    def test_each_original_pick_appears_once_in_exact_requested_count(self):
        for mode in ['VERY_LOW', 'MODERATE', 'HIGHER', 'VERY_HIGH']:
            result = split_report(self.pool, self.config.model_copy(update={'riskPreference': mode}), self.original, 3)
            self.assertEqual(len(result['candidates']), 3)
            ids = [s['eventId'] for c in result['candidates'] for s in c['selections']]
            self.assertEqual(len(ids), len(set(ids)))
            self.assertEqual(set(ids), {s.eventId for s in self.pool})
            self.assertTrue(all(c['selections'] for c in result['candidates']))
    def test_investor_balances_parts_instead_of_repeating_favourites(self):
        result = split_report(self.pool, self.config, self.original, 3)
        self.assertEqual(sorted(len(c['selections']) for c in result['candidates']), [4, 4, 4])
    def test_unavailable_picks_are_reported_and_never_replaced(self):
        result = split_report(self.pool[:-2] + [selection('new')], self.config, self.original, 3)
        self.assertEqual(result['splitDetails']['skippedSelections'], 2)
        self.assertNotIn('new', [s['eventId'] for c in result['candidates'] for s in c['selections']])
    def test_impossible_count_has_no_partial_or_duplicate_parts(self):
        result = split_report(self.pool[:2], self.config, self.original[:2], 3)
        self.assertEqual(result['candidates'], [])
        self.assertIn('non-empty', ' '.join(result['notices']))
    def test_single_pick_parts_are_supported(self):
        result = split_report(self.pool[:3], self.config, self.original[:3], 3)
        self.assertEqual([len(c['selections']) for c in result['candidates']], [1, 1, 1])
    def test_explicit_odds_limits_cannot_silently_drop_parts(self):
        result = split_report(self.pool, self.config.model_copy(update={'minimumOdds': 100, 'maximumOdds': 200}), self.original, 3)
        self.assertEqual(result['candidates'], [])
    def test_minimum_leg_count_is_respected_when_feasible(self):
        result = split_report(self.pool[:10], self.config.model_copy(update={'minimumSelections': 3}), self.original[:10], 3)
        self.assertEqual(sorted(len(c['selections']) for c in result['candidates']), [3, 3, 4])

    def test_mode_band_can_make_unequal_sizes_without_replacing_picks(self):
        pool = [selection(i, odds) for i, odds in enumerate([9, 1.2, 1.3, 1.4, 1.2, 1.3, 1.4, 1.2])]
        original = [Selection(**s.model_dump()) for s in pool]
        result = split_report(pool, self.config.model_copy(update={'minimumOdds': 1, 'maximumOdds': 10, 'riskMode': 'INVESTOR'}), original, 3)
        self.assertEqual(len(result['candidates']), 3)
        self.assertTrue(all(c['totalOdds'] <= 10 for c in result['candidates']))
        self.assertEqual(sum(len(c['selections']) for c in result['candidates']), 8)

import random
import unittest
from unittest.mock import patch

from app.generation import search
from app.intent import parse_intent, parse_rules
from app.schemas import Config
from test_flexible_generation import selection


class GenerationVarietyTests(unittest.TestCase):
    def setUp(self):
        self.pool = [selection(event, odds, .96 / odds, outcome=str(i))
                     for event in range(60) for i, odds in enumerate([1.1, 1.25, 1.45, 1.7, 2.0])]

    def test_japa_samples_across_the_range_and_varies_leg_prices_and_counts(self):
        config = Config(numberOfSlips=10, riskMode='JAPA', riskPreference='HIGHER', minimumOdds=20.01, maximumOdds=100)
        tickets, _ = search(self.pool, config, [], rng=random.Random(42))
        self.assertEqual(len(tickets), 10)
        totals = [ticket['totalOdds'] for ticket in tickets]
        self.assertTrue(all(20.01 <= total <= 100 for total in totals))
        self.assertGreater(max(totals) - min(totals), 30)
        self.assertGreater(len({len(t['selections']) for t in tickets}), 1)
        self.assertGreater(len({s['odds'] for t in tickets for s in t['selections']}), 2)
        other, _ = search(self.pool, config, [], rng=random.Random(17))
        self.assertNotEqual([t['fingerprint'] for t in tickets], [t['fingerprint'] for t in other])

    def test_exact_game_counts_and_narrow_odds_ranges_are_hard_constraints(self):
        config = Config(numberOfSlips=10, minimumSelections=5, maximumSelections=5, minimumOdds=4, maximumOdds=5)
        tickets, _ = search(self.pool, config, [], rng=random.Random(42))
        self.assertEqual(len(tickets), 10)
        self.assertTrue(all(len(t['selections']) == 5 and 4 <= t['totalOdds'] <= 5 for t in tickets))

    def test_ten_tickets_and_fifty_games_are_supported(self):
        config = Config(numberOfSlips=10, minimumSelections=50, maximumSelections=50)
        self.assertEqual(config.numberOfSlips, 10)
        for values in [{'numberOfSlips': 11}, {'maximumSelections': 51}]:
            with self.assertRaises(ValueError):
                Config(**values)

    @patch('app.intent._parse_intent', return_value=Config(minimumSelections=4, maximumSelections=4))
    def test_random_games_ignore_learned_exact_counts(self, _):
        config = parse_intent('Generate 10 tickets. Games per ticket: Random (1–50). Investor Mode', [], {'gamesPerTicket': 8})
        self.assertEqual((config.minimumSelections, config.maximumSelections), (1, 50))

    def test_typed_counts_and_exact_games_are_respected(self):
        config = parse_rules('Create 10 tickets with exactly 35 games per ticket. Lagoslife Mode')
        self.assertEqual((config.numberOfSlips, config.minimumSelections, config.maximumSelections), (10, 35, 35))
        default = parse_rules('Investor Mode')
        self.assertEqual((default.numberOfSlips, default.minimumSelections, default.maximumSelections), (10, 1, 50))

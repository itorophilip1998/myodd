import random
import unittest
from app.generation import search
from app.intent import parse_rules
from app.schemas import Config
from test_flexible_generation import selection

class ProductionImprovementTests(unittest.TestCase):
    def test_prompt_odds_choose_a_compatible_mode_without_manual_selection(self):
        config = parse_rules('Generate 5 tickets using over 1.5 and double chance around 15 odds')
        self.assertEqual(config.numberOfSlips, 5)
        self.assertEqual(config.riskMode, 'GAMBLER')
        self.assertEqual((config.minimumOdds, config.maximumOdds), (14.5, 15.5))

    def test_batch_never_repeats_exact_selection_keys(self):
        pool = [selection(i, odds=1.5) for i in range(30)]
        config = Config(numberOfSlips=10, minimumSelections=2, maximumSelections=2, minimumOdds=2, maximumOdds=3)
        tickets, _ = search(pool, config, [], rng=random.Random(42))
        self.assertEqual(len(tickets), 10)
        keys = [(s['eventId'], s['marketId'], s['outcomeId'], s.get('specifier', '')) for ticket in tickets for s in ticket['selections']]
        self.assertEqual(len(keys), len(set(keys)))

    def test_shortage_returns_fewer_tickets_instead_of_correlated_repeats(self):
        pool = [selection(i, odds=1.5) for i in range(3)]
        config = Config(numberOfSlips=10, minimumSelections=2, maximumSelections=2, minimumOdds=2, maximumOdds=3)
        tickets, _ = search(pool, config, [], rng=random.Random(42))
        self.assertEqual(len(tickets), 1)

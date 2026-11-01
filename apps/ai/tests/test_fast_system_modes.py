import asyncio
import random
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.tools.intent import parse_rules
from app.tools.results import recent_matches
from app.tools.search import search, search_system_plan
from test_flexible_generation import selection


class FastSearchTests(unittest.TestCase):
    def test_early_stop_preserves_every_odds_target_and_pick_uniqueness(self):
        from app.tools.search import mode_plan, target_odds_window
        pool = [selection(event, price, .95 / price, market='18', outcome=str(i), marketName='Over/Under', selectionName='Over 1.5')
                for event in range(150) for i, price in enumerate((1.1, 1.2, 1.25, 1.26, 1.32))]
        for mode in ('Investor Mode', 'Gambler Mode'):
            config = parse_rules(mode)
            tickets, _ = search_system_plan(pool, config, [], rng=random.Random(42))
            self.assertEqual(len(tickets), 10)
            for target, count in mode_plan(config):
                low, high = target_odds_window(target, config)
                self.assertEqual(sum(low <= t['totalOdds'] <= high for t in tickets), count)
            keys = [(s['eventId'], s['marketId'], s['outcomeId'], s['specifier']) for t in tickets for s in t['selections']]
            self.assertEqual(len(keys), len(set(keys)))

    def test_unreachable_high_floor_returns_without_sampling(self):
        pool = [selection(event, 1.3, .7) for event in range(10)]
        config = parse_rules('Investor Mode').model_copy(update={'minimumOdds': 3, 'maximumOdds': 3.1, 'minimumSelections': 5, 'maximumSelections': 5})
        rng = random.Random(42)
        with patch.object(rng, 'randint', side_effect=AssertionError('Impossible price bounds should not run random search')):
            tickets, _ = search(pool, config, [], rng=rng, steer=True)
        self.assertEqual(tickets, [])


class CachedTrendTests(unittest.IsolatedAsyncioTestCase):
    async def test_requests_do_not_wait_for_or_duplicate_network_history_refresh(self):
        ready = threading.Event()
        runtime = SimpleNamespace()
        def fetch():
            ready.wait(2)
            return []
        with patch.dict('app.tools.results._CACHE', {'at': 0, 'ttl': 0, 'rows': []}), patch('app.tools.results.load_recent_matches', side_effect=fetch) as loader:
            try:
                first = await asyncio.wait_for(recent_matches(runtime), timeout=.2)
                task = runtime.trend_refresh
                second = await asyncio.wait_for(recent_matches(runtime), timeout=.2)
                self.assertEqual((first, second), ([], []))
                self.assertIs(runtime.trend_refresh, task)
                self.assertFalse(task.done())
            finally:
                ready.set()
                await runtime.trend_refresh
            loader.assert_called_once()

    async def test_fresh_history_is_used_without_starting_network_work(self):
        runtime = SimpleNamespace()
        rows = [{'home': 'A', 'away': 'B'}]
        with patch.dict('app.tools.results._CACHE', {'at': time.time(), 'ttl': 3600, 'rows': rows}), patch('app.tools.results.load_recent_matches') as loader:
            self.assertEqual(await recent_matches(runtime), rows)
            self.assertFalse(hasattr(runtime, 'trend_refresh'))
            loader.assert_not_called()

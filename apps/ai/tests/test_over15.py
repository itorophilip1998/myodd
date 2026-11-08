"""Over 1.5 Machine — Aries rising filter + line switch + 4–6 plan."""
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.llms.vedic_o15 import RisingChart, O15_RISING_SIGN
from app.schemas import Market, ScoredSelection
from app.tools.intent import parse_rules
from app.tools.over15_picks import (
    apply_over15_ticket_filter,
    choose_over_line,
    over15_market_allowed,
)
from app.tools.generation import generate_report
from app.tools.selections import match_key
from test_flexible_generation import selection


class Over15PolicyTests(unittest.TestCase):
    def test_mode_locks_ten_tickets_at_4_to_6(self):
        config = parse_rules('Over 1.5 Machine')
        self.assertEqual(config.riskMode, 'OVER15_MACHINE')
        self.assertEqual((config.minimumOdds, config.maximumOdds, config.numberOfSlips), (4.0, 6.0, 10))
        self.assertTrue(any('Aries' in note for note in config.unhandledRequests))

    def test_leg_band_and_line_switch(self):
        self.assertEqual(choose_over_line(1.18, 1.45), 1.5)
        self.assertEqual(choose_over_line(1.08, 1.22), 2.5)
        self.assertIsNone(choose_over_line(1.08, 1.40))
        self.assertTrue(over15_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.18))
        self.assertFalse(over15_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.08))
        self.assertTrue(over15_market_allowed('18', 'Over/Under', 'total=2.5', 'Over 2.5', 1.20))
        self.assertFalse(over15_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.30))

    def test_aries_rising_keeps_o15_and_switches_cheap_lines(self):
        kickoff = datetime(2099, 1, 1, 12, 0, tzinfo=timezone.utc)
        eligible = RisingChart(sign='Aries', degree=10.0, lat=51.5, lon=-0.1, coord_src='test', eligible=True)
        ineligible = RisingChart(sign='Gemini', degree=10.0, lat=51.5, lon=-0.1, coord_src='test', eligible=False)

        def make(event, line, odds, home='Arsenal'):
            return ScoredSelection(
                eventId=str(event), marketId='18', outcomeId='12', specifier=f'total={line}',
                odds=odds, probability=0.7, confidence=70, modelVersion='test',
                supportedMarket=Market.OVER_1_5 if line == 1.5 else Market.OVER_2_5,
                homeTeam=home, awayTeam=f'Away {event}', league='League',
                kickoffAt=kickoff, marketName='Over/Under', selectionName=f'Over {line}',
            )

        with patch('app.tools.over15_picks.cast_rising', return_value=eligible):
            pool = [
                make(1, 1.5, 1.18), make(1, 2.5, 1.40),
                make(2, 1.5, 1.05), make(2, 2.5, 1.20),
                make(3, 1.5, 1.22),
            ]
            kept = apply_over15_ticket_filter(pool)
            lines = {(s.eventId, round(float(s.specifier.split('=')[1]), 1)) for s in kept}
            self.assertEqual(lines, {('1', 1.5), ('2', 2.5), ('3', 1.5)})
            self.assertTrue(all(s.odds <= 1.25 for s in kept))

        with patch('app.tools.over15_picks.cast_rising', return_value=ineligible):
            self.assertEqual(apply_over15_ticket_filter([make(9, 1.5, 1.18)]), [])

    def test_plan_builds_ten_tickets_in_4_to_6(self):
        pool = [
            selection(event, price, 0.9 / price, market='18', outcome=str(i),
                      marketName='Over/Under', selectionName='Over 1.5',
                      supported=Market.OVER_1_5)
            for event in range(120) for i, price in enumerate((1.12, 1.15, 1.18, 1.2, 1.22))
        ]
        config = parse_rules('Over 1.5 Machine')
        report = generate_report(pool, config, [])
        self.assertEqual(len(report['candidates']), 10)
        self.assertTrue(all(4.0 <= c['totalOdds'] <= 6.0 for c in report['candidates']))
        self.assertTrue(all(s['odds'] <= 1.25 for c in report['candidates'] for s in c['selections']))
        used = set()
        for candidate in report['candidates']:
            for pick in candidate['selections']:
                key = match_key(pick)
                self.assertNotIn(key, used, f'same game repeated across tickets: {key}')
                used.add(key)

    def test_short_pool_does_not_escape_4_to_6(self):
        # Too few legs to reach 4.0 — return fewer tickets rather than a near-2 shortfall.
        pool = [
            selection(event, 1.15, 0.78, market='18', outcome='12',
                      marketName='Over/Under', selectionName='Over 1.5',
                      supported=Market.OVER_1_5)
            for event in range(6)
        ]
        config = parse_rules('Over 1.5 Machine')
        report = generate_report(pool, config, [])
        self.assertTrue(all(4.0 <= c['totalOdds'] <= 6.0 for c in report['candidates']))
        self.assertLess(len(report['candidates']), 10)

    def test_default_rising_sign_is_aries(self):
        self.assertEqual(O15_RISING_SIGN, 'Aries')


if __name__ == '__main__':
    unittest.main()

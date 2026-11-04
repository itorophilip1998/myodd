"""Goals Desk v2 — O1.5 ≥3 Yes / O2.5 all-4 Yes + odds gates."""
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.llms.goals_desk_v2 import all4_yes, at_least_n_yes, cast_desk, desk_yes_count, goals_desk_probability
from app.schemas import Market, ScoredSelection
from app.tools.goals_desk_picks import (
    apply_goals_desk_ticket_filter,
    goals_desk_market_allowed,
)
from app.tools.intent import parse_rules


class GoalsDeskPolicyTests(unittest.TestCase):
    def test_mode_locks_ten_tickets_in_3_to_6_band(self):
        config = parse_rules('Goals Desk v2')
        self.assertEqual(config.riskMode, 'GOALS_DESK_V2')
        self.assertEqual((config.minimumOdds, config.maximumOdds, config.numberOfSlips), (3.0, 6.0, 10))
        self.assertTrue(any('Goals Desk' in note or 'all-4' in note.lower() or '3 of 4' in note.lower() for note in config.unhandledRequests))

    def test_listing_odds_gates(self):
        self.assertTrue(goals_desk_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.18))
        self.assertTrue(goals_desk_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.09))
        self.assertTrue(goals_desk_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.13))
        self.assertTrue(goals_desk_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.27))
        self.assertFalse(goals_desk_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.08))
        self.assertFalse(goals_desk_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.28))
        self.assertTrue(goals_desk_market_allowed('18', 'Over/Under', 'total=2', 'Over 2', 1.22))
        self.assertTrue(goals_desk_market_allowed('18', 'Over/Under', 'total=2.5', 'Over 2.5', 1.55))
        self.assertFalse(goals_desk_market_allowed('18', 'Over/Under', 'total=2.5', 'Over 2.5', 1.61))

    def test_o15_allows_3_of_4_while_o25_needs_all4(self):
        four = {'zw': 'Yes', 'omi': 'Yes', 'len': 'Yes', 'book': 'Yes'}
        three = {'zw': 'Yes', 'omi': 'Yes', 'len': 'Yes', 'book': 'Pass'}
        two = {'zw': 'Yes', 'omi': 'Yes', 'len': 'Pass', 'book': 'Pass'}
        self.assertEqual(desk_yes_count(four), 4)
        self.assertTrue(all4_yes(four))
        self.assertTrue(at_least_n_yes(three, 3))
        self.assertFalse(all4_yes(three))
        self.assertFalse(at_least_n_yes(two, 3))
        self.assertGreater(goals_desk_probability(1.5, 4), goals_desk_probability(1.5, 3))

    def test_filter_takes_o15_switches_asian_and_allows_o25(self):
        kickoff = datetime(2099, 1, 1, 12, 0, tzinfo=timezone.utc)
        yes = {'zw': 'Yes', 'omi': 'Yes', 'len': 'Yes', 'book': 'Yes', 'zw_gated': 'Yes'}
        three = {'zw': 'Yes', 'omi': 'Yes', 'len': 'Yes', 'book': 'Pass', 'zw_gated': 'Yes'}
        no = {'zw': 'No', 'omi': 'No', 'len': 'No', 'book': 'No', 'zw_gated': 'No'}

        def make(event, line, odds, home='Arsenal'):
            supported = Market.OVER_1_5 if line == 1.5 else Market.OVER_2_5 if line == 2.5 else Market.OTHER
            return ScoredSelection(
                eventId=str(event), marketId='18', outcomeId='12', specifier=f'total={line}',
                odds=odds, probability=0.7, confidence=70, modelVersion='test',
                supportedMarket=supported,
                homeTeam=home, awayTeam=f'Away {event}', league='League',
                kickoffAt=kickoff, marketName='Over/Under', selectionName=f'Over {line}',
            )

        # Pace = ZW+OMI+LEN Yes on O2.5. Skip Omikuji 吉.
        paced_o25 = {'zw': 'Yes', 'omi': 'Yes', 'len': 'Yes', 'book': 'Yes', 'zw_gated': 'Pass'}
        no_pace_o25 = {'zw': 'No', 'omi': 'Yes', 'len': 'No', 'book': 'Pass', 'zw_gated': 'No'}
        omi_pass_o25 = {'zw': 'Yes', 'omi': 'Pass', 'len': 'Yes', 'book': 'Yes', 'zw_gated': 'Pass'}
        desk_o15 = type('D', (), {'o15': yes, 'o25': paced_o25, 'btts': no, 'lot': '中吉'})()
        desk_o15_3 = type('D', (), {'o15': three, 'o25': paced_o25, 'btts': no, 'lot': '末吉'})()
        desk_o15_no_pace = type('D', (), {'o15': yes, 'o25': no_pace_o25, 'btts': no, 'lot': '中吉'})()
        desk_o15_weak_lot = type('D', (), {'o15': yes, 'o25': paced_o25, 'btts': no, 'lot': '吉'})()
        desk_o15_omi_pass = type('D', (), {'o15': yes, 'o25': omi_pass_o25, 'btts': no, 'lot': '凶'})()
        desk_o25 = type('D', (), {'o15': no, 'o25': yes, 'btts': no, 'lot': '中吉'})()
        desk_o25_3 = type('D', (), {'o15': no, 'o25': three, 'btts': no, 'lot': '中吉'})()
        desk_o25_weak = type('D', (), {'o15': no, 'o25': yes, 'btts': no, 'lot': '吉'})()
        desk_both = type('D', (), {'o15': yes, 'o25': paced_o25, 'btts': no, 'lot': '末吉'})()

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15):
            kept = apply_goals_desk_ticket_filter([
                make(1, 1.5, 1.18), make(1, 2.5, 1.40),
            ])
            self.assertEqual(len(kept), 1)
            self.assertEqual(kept[0].specifier, 'total=1.5')
            self.assertIn('pace', kept[0].modelVersion)

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15_3):
            kept = apply_goals_desk_ticket_filter([make(11, 1.5, 1.18)])
            self.assertEqual(len(kept), 1)
            self.assertIn('3of4', kept[0].modelVersion)
            self.assertIn('pace', kept[0].modelVersion)

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15_no_pace):
            self.assertEqual(apply_goals_desk_ticket_filter([make(12, 1.5, 1.18)]), [])

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15_weak_lot):
            self.assertEqual(apply_goals_desk_ticket_filter([make(13, 1.5, 1.18)]), [])

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15_omi_pass):
            # 凶/大凶 Omikuji O2.5 is Pass → no ZW/OMI/LEN pace → O1.5 blocked.
            self.assertEqual(apply_goals_desk_ticket_filter([make(15, 1.5, 1.18)]), [])

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15):
            # 1.09–1.13 → Asian Over 2 (still O1.5 ticket lane)
            kept = apply_goals_desk_ticket_filter([
                make(2, 1.5, 1.11), make(2, 2.0, 1.25), make(2, 2.5, 1.40),
            ])
            self.assertEqual(len(kept), 1)
            self.assertEqual(kept[0].specifier, 'total=2.0')

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15):
            kept = apply_goals_desk_ticket_filter([
                make(7, 1.5, 1.09), make(7, 2.0, 1.20),
            ])
            self.assertEqual(kept[0].specifier, 'total=2.0')

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15):
            kept = apply_goals_desk_ticket_filter([
                make(8, 1.5, 1.13), make(8, 2.0, 1.22),
            ])
            self.assertEqual(kept[0].specifier, 'total=2.0')

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o15):
            # Asian window with no Asian line → skip
            self.assertEqual(apply_goals_desk_ticket_filter([make(3, 1.5, 1.11)]), [])

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o25):
            kept = apply_goals_desk_ticket_filter([make(4, 2.5, 1.55), make(4, 1.5, 1.30)])
            self.assertEqual(len(kept), 1)
            self.assertEqual(kept[0].specifier, 'total=2.5')

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o25_3):
            # O2.5 still requires all 4 Yes
            self.assertEqual(apply_goals_desk_ticket_filter([make(9, 2.5, 1.55)]), [])

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o25):
            self.assertEqual(apply_goals_desk_ticket_filter([make(5, 2.5, 1.65)]), [])

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_o25_weak):
            self.assertEqual(apply_goals_desk_ticket_filter([make(14, 2.5, 1.55)]), [])

        with patch('app.tools.goals_desk_picks.cast_desk', return_value=desk_both):
            # Prefer O1.5 path when both qualify
            kept = apply_goals_desk_ticket_filter([make(6, 1.5, 1.20), make(6, 2.5, 1.50)])
            self.assertEqual(len(kept), 1)
            self.assertEqual(kept[0].specifier, 'total=1.5')

    def test_cast_is_deterministic(self):
        kickoff = datetime(2026, 11, 4, 19, 45, tzinfo=timezone.utc)
        a = cast_desk('Cardiff', 'West Ham', kickoff)
        b = cast_desk('Cardiff', 'West Ham', kickoff)
        self.assertEqual(a.o15, b.o15)
        self.assertEqual(a.o25, b.o25)
        self.assertEqual(a.lot, b.lot)

    def test_lane_plan_keeps_o15_lane_off_o25(self):
        from app.tools.generation import generate_report
        from app.tools.search import search_goals_desk_plan
        import random

        kickoff = datetime(2099, 1, 1, 15, 0, tzinfo=timezone.utc)

        def make(event, line, odds):
            supported = Market.OVER_1_5 if line == 1.5 else Market.OVER_2_5 if line == 2.5 else Market.OTHER
            return ScoredSelection(
                eventId=str(event), marketId='18', outcomeId='12', specifier=f'total={line}',
                odds=odds, probability=0.75, confidence=75, modelVersion='goals-desk-v2-all4-吉',
                supportedMarket=supported,
                homeTeam=f'Home {event}', awayTeam=f'Away {event}', league='League',
                kickoffAt=kickoff, marketName='Over/Under', selectionName=f'Over {line}',
            )

        # O1.5 + Asian O2 share the 3–5 lane; O2.5 stays on 4–6.
        pool = (
            [make(i, 1.5, 1.18) for i in range(12)]
            + [make(50 + i, 2.0, 1.22) for i in range(8)]
            + [make(100 + i, 2.5, 1.45) for i in range(20)]
        )
        config = parse_rules('Goals Desk v2')
        tickets, _ = search_goals_desk_plan(pool, config, [], rng=random.Random(7))
        self.assertGreaterEqual(len(tickets), 1)
        for ticket in tickets:
            lines = {round(float(s['specifier'].split('=')[1]), 1) for s in ticket['selections']}
            if 2.5 in lines:
                self.assertEqual(lines, {2.5}, f'O2.5 ticket mixed with O1.5 lane: {lines}')
                self.assertTrue(4.0 <= ticket['totalOdds'] <= 6.0, ticket['totalOdds'])
            else:
                self.assertTrue(lines <= {1.5, 2.0}, f'unexpected lines: {lines}')
                self.assertTrue(3.0 <= ticket['totalOdds'] <= 5.0, ticket['totalOdds'])

        report = generate_report(pool, config, [])
        for candidate in report['candidates']:
            lines = {round(float(s['specifier'].split('=')[1]), 1) for s in candidate['selections']}
            if 2.5 in lines:
                self.assertEqual(lines, {2.5})
            else:
                self.assertTrue(lines <= {1.5, 2.0})


if __name__ == '__main__':
    unittest.main()

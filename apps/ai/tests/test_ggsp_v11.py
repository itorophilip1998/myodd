"""GGSP v1.1 — CLEAN Chaldean filter + 3–4 plan + no same-game repeat."""
import unittest
from datetime import datetime, timezone

from app.llms.ggsp import classify_combo, is_clean_select, is_hard_skip_league
from app.llms.ggsp_aliases import expand_team_name
from app.schemas import Market, ScoredSelection
from app.tools.generation import generate_report
from app.tools.ggsp_picks import apply_ggsp_ticket_filter, ggsp_market_allowed
from app.tools.intent import parse_rules
from app.tools.selections import match_key
from test_flexible_generation import selection


class GgspV11PolicyTests(unittest.TestCase):
    def test_mode_locks_ten_tickets_at_3_to_4(self):
        config = parse_rules('GGSP v1.1')
        self.assertEqual(config.riskMode, 'GGSP_V11')
        self.assertEqual((config.minimumOdds, config.maximumOdds, config.numberOfSlips), (3.0, 4.0, 10))
        self.assertTrue(any('Chaldean' in note or 'GGSP' in note for note in config.unhandledRequests))

    def test_leg_band_allows_cheap_o15_and_asian(self):
        self.assertTrue(ggsp_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.22))
        self.assertTrue(ggsp_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.09))
        self.assertTrue(ggsp_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.30))
        self.assertTrue(ggsp_market_allowed('18', 'Over/Under', 'total=2', 'Over 2', 1.20))
        self.assertFalse(ggsp_market_allowed('18', 'Over/Under', 'total=1.5', 'Over 1.5', 1.31))
        self.assertFalse(ggsp_market_allowed('18', 'Over/Under', 'total=2.5', 'Over 2.5', 1.20))

    def test_flashscore_aliases_restore_clean(self):
        # Raw SportyBet shorts miss; aliases expand to Flashscore spellings.
        self.assertEqual(expand_team_name('Thun'), 'FC Thun')
        self.assertEqual(expand_team_name('Hearts'), 'Heart Of Midlothian')
        self.assertEqual(expand_team_name('Pafos'), 'Paphos')
        self.assertEqual(
            classify_combo('Thun', 'Hearts'),
            classify_combo('FC Thun', 'Heart Of Midlothian', expand=False),
        )
        self.assertEqual(classify_combo('Thun', 'Hearts')[2], 'CLEAN_7_8')
        self.assertEqual(classify_combo('Twente', 'Pafos')[2], 'CLEAN_7_8')
        self.assertEqual(classify_combo('FC Twente', 'Pafos')[2], 'CLEAN_7_8')
        self.assertEqual(classify_combo('Red Star Belgrade', 'Inter Escaldes')[2], 'CLEAN_7_8')
        # SportyBet shorts that flipped today's UEL/UECL CLEAN board without aliases
        self.assertEqual(classify_combo('Anderlecht', 'Salzburg'), (89, 8, 'CLEAN_7_8'))
        self.assertEqual(classify_combo('NEC', 'Omonia'), (88, 7, 'CLEAN_7_8'))
        self.assertEqual(classify_combo('Leverkusen', 'Marseille'), (80, 8, 'CLEAN_7_8'))
        self.assertEqual(classify_combo('Bayer Leverkusen', 'Olympique Marseille'), (80, 8, 'CLEAN_7_8'))

    def test_clean_and_league_gate(self):
        # Anderlecht + Red Bull Salzburg → CLEAN in today's board (tot 89 / root 8)
        tot, root, tier = classify_combo('Anderlecht', 'Red Bull Salzburg')
        self.assertEqual(tier, 'CLEAN_7_8')
        self.assertTrue(is_clean_select('Anderlecht', 'Red Bull Salzburg', 'UEFA Europa League'))
        self.assertTrue(is_hard_skip_league('Montenegro', 'Second League'))
        self.assertFalse(is_clean_select('Zeta', 'Mladost', 'Second League', category='Montenegro'))
        # Competition-only must not silently keep country-gated HARD skips.
        self.assertTrue(is_clean_select('Zeta', 'Mladost', 'Second League'))  # no country → cannot match HARD
        self.assertFalse(is_clean_select('Ntugasaze', 'Entebbe UPPC', 'Premier League', category='Uganda'))
        self.assertFalse(is_clean_select('Al Jubail', 'Al Sharq', 'Division 2', category='Saudi Arabia'))

    def test_filter_keeps_clean_o15(self):
        kickoff = datetime(2099, 1, 1, 12, 0, tzinfo=timezone.utc)

        def make(event, home, away, league, line, odds):
            supported = Market.OVER_1_5 if abs(line - 1.5) < 1e-6 else Market.OTHER
            return ScoredSelection(
                eventId=str(event), marketId='18', outcomeId='12', specifier=f'total={line}',
                odds=odds, probability=0.7, confidence=70, modelVersion='test',
                supportedMarket=supported,
                homeTeam=home, awayTeam=away, league=league,
                kickoffAt=kickoff, marketName='Over/Under', selectionName=f'Over {line}',
            )

        def make_cat(event, home, away, league, category, line, odds):
            return make(event, home, away, league, line, odds).model_copy(
                update={'categoryName': category},
            )

        pool = [
            make(1, 'Anderlecht', 'Red Bull Salzburg', 'UEFA Europa League', 1.5, 1.22),
            make(1, 'Anderlecht', 'Red Bull Salzburg', 'UEFA Europa League', 2.5, 1.55),
            # SportyBet shape: category=country, league=tournament only
            make_cat(2, 'Zeta', 'Mladost', 'Second League', 'Montenegro', 1.5, 1.20),
            make_cat(4, 'Ntugasaze', 'Entebbe UPPC', 'Premier League', 'Uganda', 1.5, 1.18),
            make(3, 'AC Milan', 'Ferencvaros', 'UEFA Europa League', 1.5, 1.18),  # root 2 avoid
            # Alias restores CLEAN; cheap O1.5 → Asian Over 2
            make(5, 'Thun', 'Hearts', 'UEFA Europa Conference League', 1.5, 1.10),
            make(5, 'Thun', 'Hearts', 'UEFA Europa Conference League', 2.0, 1.18),
        ]
        kept = apply_ggsp_ticket_filter(pool)
        self.assertEqual({s.eventId for s in kept}, {'1', '5'})
        by_event = {s.eventId: s for s in kept}
        self.assertTrue(by_event['1'].specifier.endswith('1.5'))
        self.assertEqual(by_event['5'].specifier, 'total=2.0')

    def test_cheap_o15_without_asian_is_skipped(self):
        kickoff = datetime(2099, 1, 1, 12, 0, tzinfo=timezone.utc)
        pool = [
            ScoredSelection(
                eventId='9', marketId='18', outcomeId='12', specifier='total=1.5',
                odds=1.10, probability=0.7, confidence=70, modelVersion='test',
                supportedMarket=Market.OVER_1_5,
                homeTeam='Anderlecht', awayTeam='Red Bull Salzburg',
                league='UEFA Europa League', kickoffAt=kickoff,
                marketName='Over/Under', selectionName='Over 1.5',
            ),
        ]
        self.assertEqual(apply_ggsp_ticket_filter(pool), [])

    def test_plan_builds_tickets_in_3_to_4_without_repeat_games(self):
        # Build a CLEAN-friendly pool: many unique home/away pairs that grade CLEAN
        # and priced O1.5 in band. Use synthetic short names that land on roots 7/8.
        homes = [f'Team{chr(65 + i)}' for i in range(26)]
        aways = [f'Club{chr(65 + i)}' for i in range(26)]
        pool = []
        event = 0
        for home in homes:
            for away in aways:
                tot, root, tier = classify_combo(home, away)
                if tier != 'CLEAN_7_8':
                    continue
                event += 1
                for price in (1.15, 1.18, 1.22, 1.25, 1.28):
                    pool.append(selection(
                        event, price, 0.9 / price, market='18', outcome='12',
                        marketName='Over/Under', selectionName='Over 1.5',
                        supported=Market.OVER_1_5,
                    ).model_copy(update={
                        'specifier': 'total=1.5',
                        'homeTeam': home,
                        'awayTeam': away,
                    }))
                if event >= 80:
                    break
            if event >= 80:
                break
        self.assertGreaterEqual(event, 40, 'need enough CLEAN pairs for the plan')
        config = parse_rules('GGSP v1.1')
        report = generate_report(pool, config, [])
        # Full 3–4 band search should fill several slips when the CLEAN pool is rich
        # (the old ±0.10 slices around 3.0 starved at ~2 tickets).
        self.assertGreaterEqual(len(report['candidates']), 4)
        self.assertTrue(all(3.0 <= c['totalOdds'] <= 4.0 for c in report['candidates']))
        used = set()
        for candidate in report['candidates']:
            for pick in candidate['selections']:
                key = match_key(pick)
                self.assertNotIn(key, used, f'same game repeated across tickets: {key}')
                used.add(key)


if __name__ == '__main__':
    unittest.main()

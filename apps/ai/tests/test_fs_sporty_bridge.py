"""Flashscore-first ↔ SportyBet name bridge."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from app.schemas import BookmakerMarket, Fixture, Outcome
from app.tools.flashscore_feed import FlashscoreFixture, day_offsets_covering
from app.tools.fs_sporty_bridge import (
    apply_flashscore_first,
    best_flashscore_match,
    best_sporty_match,
    match_score,
    overlay_flashscore_names,
)


def _ko(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, 5, hour, minute, tzinfo=timezone.utc)


def _o15_market(odds: float = 1.22) -> list[BookmakerMarket]:
    return [BookmakerMarket(
        marketId='18', marketName='Over/Under', specifier='total=1.5',
        outcomes=[Outcome(outcomeId='12', outcomeName='Over 1.5', odds=odds, isActive=True)],
    )]


class FlashscoreBridgeTests(unittest.TestCase):
    def test_day_offsets_cover_window(self):
        now = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
        after = datetime(2026, 11, 5, 0, 0, tzinfo=timezone.utc)
        before = datetime(2026, 11, 7, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(day_offsets_covering(after, before, now=now), [0, 1])

    def test_day_offsets_include_rolling_next_day_and_lagos_end(self):
        now = datetime(2026, 11, 14, 19, 14, tzinfo=timezone.utc)
        # Next-24h from evening must pull tomorrow's Flashscore day board.
        self.assertEqual(
            day_offsets_covering(now, datetime(2026, 11, 15, 19, 14, tzinfo=timezone.utc), now=now),
            [0, 1],
        )
        # Lagos 3-day end (exclusive 23:00Z on last calendar day) must include that UTC day.
        self.assertEqual(
            day_offsets_covering(now, datetime(2026, 11, 16, 23, 0, tzinfo=timezone.utc), now=now),
            [0, 1, 2],
        )

    def test_match_short_sporty_to_flashscore(self):
        fs = FlashscoreFixture(
            home='Bayer Leverkusen', away='Marseille', league='Europa League',
            kickoff_at=_ko(20), status='NS', ab='1',
        )
        self.assertGreaterEqual(
            match_score('Leverkusen', 'Marseille', _ko(20), fs),
            0.72,
        )
        hit = best_flashscore_match('Leverkusen', 'Olympique Marseille', _ko(20), [fs])
        self.assertIsNotNone(hit)
        self.assertEqual(hit.home, 'Bayer Leverkusen')

    def test_man_utd_alias_matches_manchester_united(self):
        fs = FlashscoreFixture(
            home='Manchester United', away='Chelsea', league='ENGLAND: Premier League',
            kickoff_at=_ko(15), status='NS', ab='1',
        )
        self.assertGreaterEqual(match_score('Man Utd', 'Chelsea', _ko(15), fs), 0.72)
        hit = best_flashscore_match('Man Utd', 'Chelsea', _ko(15), [fs])
        self.assertIsNotNone(hit)
        self.assertEqual(hit.home, 'Manchester United')
        sporty = Fixture(
            eventId='mu', homeTeam='Man Utd', awayTeam='Chelsea', league='EPL',
            kickoffAt=_ko(15), markets=_o15_market(),
        )
        self.assertEqual(best_sporty_match(fs, [sporty]).eventId, 'mu')

    def test_overlay_rewrites_sporty_names(self):
        board = [
            FlashscoreFixture(
                home='FC Thun', away='Heart Of Midlothian', league='Conference League',
                kickoff_at=_ko(17, 45), status='NS', ab='1',
            ),
            FlashscoreFixture(
                home='Anderlecht', away='Red Bull Salzburg', league='Europa League',
                kickoff_at=_ko(17, 45), status='NS', ab='1',
            ),
        ]
        fixtures = [
            Fixture(
                eventId='1', homeTeam='Thun', awayTeam='Hearts', league='UECL',
                kickoffAt=_ko(17, 45), markets=[],
            ),
            Fixture(
                eventId='2', homeTeam='Anderlecht', awayTeam='Salzburg', league='UEL',
                kickoffAt=_ko(17, 45), markets=[],
            ),
        ]
        rewritten, matched, unmatched, weak = overlay_flashscore_names(fixtures, board)
        self.assertEqual(matched, 2)
        self.assertEqual(unmatched, 0)
        self.assertEqual(weak, 0)
        self.assertEqual(rewritten[0].homeTeam, 'FC Thun')
        self.assertEqual(rewritten[0].awayTeam, 'Heart Of Midlothian')
        self.assertEqual(rewritten[1].awayTeam, 'Red Bull Salzburg')

    def test_overlay_keeps_unmatched_sporty_by_default(self):
        """Sporty→FS helper no longer drops unmatched rows by default (FS-first owns gating)."""
        board = [
            FlashscoreFixture(
                home='Anderlecht', away='Red Bull Salzburg', league='Europa League',
                kickoff_at=_ko(17, 45), status='NS', ab='1',
            ),
        ]
        fixtures = [
            Fixture(
                eventId='1', homeTeam='Anderlecht', awayTeam='Salzburg', league='UEL',
                kickoffAt=_ko(17, 45), markets=[],
            ),
            Fixture(
                eventId='2', homeTeam='Totally Unknown FC', awayTeam='Ghost United',
                league='Mystery', kickoffAt=_ko(12), markets=[],
            ),
        ]
        rewritten, matched, unmatched, weak = overlay_flashscore_names(fixtures, board)
        self.assertEqual({f.eventId for f in rewritten}, {'1', '2'})
        self.assertEqual(matched, 1)
        self.assertEqual(unmatched, 1)
        self.assertEqual(weak, 0)

    def test_apply_flashscore_first_gates_on_fs_then_alias_to_sporty(self):
        board = [
            FlashscoreFixture(
                home='Anderlecht', away='Red Bull Salzburg', league='EUROPE: Europa League',
                kickoff_at=_ko(17, 45), status='NS', ab='1',
            ),
            # CLEAN on FS but absent from SportyBet list
            FlashscoreFixture(
                home='Riga', away='FK Jablonec', league='EUROPE: Conference League',
                kickoff_at=_ko(20), status='NS', ab='1',
            ),
            # Sporty-only spelling noise must not block FS→Sporty alias pick
        ]
        fixtures = [
            Fixture(
                eventId='1', homeTeam='Anderlecht', awayTeam='Salzburg', league='UEL',
                categoryName='Europe', kickoffAt=_ko(17, 45),
                markets=_o15_market(),
            ),
            # Extra Sporty row that is NOT on Flashscore — must not appear in output
            Fixture(
                eventId='ghost', homeTeam='Ghost FC', awayTeam='Phantom Utd', league='Mystery',
                kickoffAt=_ko(12), markets=_o15_market(),
            ),
        ]
        result = apply_flashscore_first(fixtures, 'GGSP_V11', board=board)
        self.assertEqual([f.eventId for f in result.fixtures], ['1'])
        self.assertEqual(result.fixtures[0].awayTeam, 'Red Bull Salzburg')
        self.assertEqual(result.matched, 1)
        self.assertTrue(any('Riga' in row for row in result.missing_on_sporty))
        self.assertIn('Flashscore-first', result.notice)
        self.assertIn('FS-eligible', result.notice)
        self.assertIn('SportyBet picks', result.notice)
        self.assertNotIn('dropped unmatched', result.notice)


if __name__ == '__main__':
    unittest.main()

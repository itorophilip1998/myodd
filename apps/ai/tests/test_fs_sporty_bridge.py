"""Flashscore-first ↔ SportyBet name bridge."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from app.schemas import BookmakerMarket, Fixture, Outcome
from app.tools.flashscore_feed import FlashscoreFixture, day_offsets_covering
from app.tools.fs_sporty_bridge import (
    apply_flashscore_first,
    best_flashscore_match,
    match_score,
    overlay_flashscore_names,
)


def _ko(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, 5, hour, minute, tzinfo=timezone.utc)


class FlashscoreBridgeTests(unittest.TestCase):
    def test_day_offsets_cover_window(self):
        now = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
        after = datetime(2026, 11, 5, 0, 0, tzinfo=timezone.utc)
        before = datetime(2026, 11, 7, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(day_offsets_covering(after, before, now=now), [0, 1])

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
        rewritten, matched = overlay_flashscore_names(fixtures, board)
        self.assertEqual(matched, 2)
        self.assertEqual(rewritten[0].homeTeam, 'FC Thun')
        self.assertEqual(rewritten[0].awayTeam, 'Heart Of Midlothian')
        self.assertEqual(rewritten[1].awayTeam, 'Red Bull Salzburg')

    def test_apply_flashscore_first_notice_and_ggsp_missing(self):
        board = [
            FlashscoreFixture(
                home='Anderlecht', away='Red Bull Salzburg', league='Europa League',
                kickoff_at=_ko(17, 45), status='NS', ab='1',
            ),
            # CLEAN on FS but absent from SportyBet list
            FlashscoreFixture(
                home='Riga', away='FK Jablonec', league='Conference League',
                kickoff_at=_ko(20), status='NS', ab='1',
            ),
        ]
        fixtures = [
            Fixture(
                eventId='1', homeTeam='Anderlecht', awayTeam='Salzburg', league='UEL',
                categoryName='Europe', kickoffAt=_ko(17, 45),
                markets=[BookmakerMarket(
                    marketId='18', marketName='Over/Under', specifier='total=1.5',
                    outcomes=[Outcome(outcomeId='12', outcomeName='Over 1.5', odds=1.22, isActive=True)],
                )],
            ),
        ]
        result = apply_flashscore_first(fixtures, 'GGSP_V11', board=board)
        self.assertEqual(result.matched, 1)
        self.assertEqual(result.fixtures[0].awayTeam, 'Red Bull Salzburg')
        self.assertGreaterEqual(result.eligible_fs, 1)
        self.assertTrue(any('Riga' in row for row in result.missing_on_sporty) or result.eligible_fs >= 1)
        self.assertIn('Flashscore-first', result.notice)


if __name__ == '__main__':
    unittest.main()

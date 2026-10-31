import unittest
from pathlib import Path

from app.schemas import Market, ScoredSelection
from app.team_trends import apply_match_trends, market_kind, parse_bbc_results, trend_probability


def scored(event, market_name, selection_name, **values):
    values.setdefault('marketId', '18')
    values.setdefault('outcomeId', '12')
    values.setdefault('supportedMarket', Market.OTHER)
    return ScoredSelection(
        eventId=event, specifier='', odds=1.25, probability=.8, confidence=80, modelVersion='test',
        homeTeam='Alpha', awayTeam='Beta', league='League', marketName=market_name,
        selectionName=selection_name, kickoffAt='2099-01-01T12:00:00Z', **values,
    )


def played(home, away, home_goals, away_goals, kickoff):
    return {'home': home, 'away': away, 'homeGoals': home_goals, 'awayGoals': away_goals, 'kickoff': kickoff}


def form():
    rows = []
    for index, score in enumerate((2, 3, 2, 2, 2)):
        rows.append(played('Alpha', f'Home {index}', score, 0, f'2026-10-{10 + index:02d}T15:00:00Z'))
    for index in range(5):
        rows.append(played(f'Away {index}', 'Beta', 2, 0, f'2026-10-{16 + index:02d}T15:00:00Z'))
    return rows


class TeamTrendTests(unittest.TestCase):
    def test_finished_scores_use_full_time_not_penalties(self):
        html = Path('apps/api/test/fixtures/bbc-results-2026-10-20.html').read_text()
        rows = parse_bbc_results(html, '2026-10-20')
        self.assertEqual(rows[0]['homeGoals'], 2)
        self.assertEqual(rows[1]['homeGoals'], 1)
        self.assertEqual(rows[1]['awayGoals'], 1)

    def test_recent_goals_rank_the_side_that_has_been_scoring(self):
        self.assertGreater(trend_probability('double', '', '1X', 2.2, 0.3), 0.7)
        self.assertGreater(
            trend_probability('match_goals', 'total=1.5', 'Over 1.5', 2.2, 0.3),
            trend_probability('match_goals', 'total=1.5', 'Under 1.5', 2.2, 0.3),
        )
        self.assertIsNone(market_kind('Total corners'))
        self.assertEqual(market_kind('Double Chance'), 'double')
        self.assertEqual(market_kind('Home Team Goals Under/Over'), 'home_goals')
        self.assertEqual(market_kind('Home or over 2.5', 'Yes'), 'home_or_over')
        self.assertEqual(market_kind('Result or total', 'Away or over 2.5', 'total=2.5'), 'away_or_over')
        self.assertEqual(market_kind('Draw or over 2.5', 'Yes'), 'draw_or_over')
        self.assertGreater(trend_probability('home_or_over', '', 'Yes', 2.2, 0.3), 0.7)

    def test_investor_pool_keeps_scored_goal_markets_and_drops_corners(self):
        pool = [
            scored('1', 'Double Chance', '1X', marketId='10', outcomeId='9'),
            scored('2', 'Over/Under', 'Over 1.5', supportedMarket=Market.OVER_1_5),
            scored('3', 'Total corners', 'Under 8.5'),
        ]
        ranked, note = apply_match_trends(pool, form())
        self.assertEqual({row.marketName for row in ranked}, {'Double Chance', 'Over/Under'})
        self.assertTrue(all(row.modelVersion == 'trend-bbc-v1' for row in ranked))
        self.assertIn('recent finished scores', note)
        self.assertIn('Corners', note)

    def test_fewer_than_five_games_keeps_the_price(self):
        short = [row for row in form() if row['home'] == 'Alpha'][:4] + [row for row in form() if row['away'] == 'Beta'][:4]
        pool = [scored('1', 'Double Chance', '1X', marketId='10', outcomeId='9')]
        ranked, note = apply_match_trends(pool, short)
        self.assertEqual(ranked[0].modelVersion, 'test')
        self.assertIn('bookmaker prices', note)

    def test_missing_scores_keep_the_price_ranking(self):
        pool = [scored('1', 'Double Chance', '1X')]
        ranked, note = apply_match_trends(pool, [])
        self.assertEqual(ranked, pool)
        self.assertIn('bookmaker prices', note)

import unittest
from datetime import datetime, timezone

from app.generation import generate_report
from app.intent import parse_intent
from app.market_preferences import resolve_preferences
from app.predictions import OddsModel, score_fixtures
from app.schemas import Config, Fixture, Market, MarketRule, ScoredSelection, Selection


def selection(event, odds=2, probability=.4, market='1', outcome='1', supported=Market.HOME, **values):
    values.setdefault('marketName', 'Market')
    values.setdefault('selectionName', 'Outcome')
    return ScoredSelection(eventId=str(event), marketId=market, outcomeId=outcome, specifier='',
                           odds=odds, probability=probability, confidence=probability * 100,
                           modelVersion='test', supportedMarket=supported,
                           homeTeam=f'Home {event}', awayTeam=f'Away {event}', league='League',
                           kickoffAt='2099-01-01T12:00:00Z', **values)


def original(*events):
    return [Selection(eventId=str(event), marketId='1', outcomeId='1') for event in events]


class FlexibleGenerationTests(unittest.TestCase):
    def test_lower_risk_can_rank_high_odds_without_a_probability_floor(self):
        pool = [selection(i, odds=3, probability=.3) for i in range(8)]
        report = generate_report(pool, Config(numberOfSlips=10, minimumOdds=100, maximumOdds=500,
                                             riskPreference='LOWER'), [])
        self.assertEqual(len(report['candidates']), 1)
        self.assertTrue(all(100 <= c['totalOdds'] <= 500 for c in report['candidates']))

    def test_adaptive_mode_adds_matches_and_explains_it(self):
        pool = [selection(1, 1.2, .8), selection(2, 1.2, .8), selection(3), selection(4)]
        report = generate_report(pool, Config(numberOfSlips=2, minimumOdds=3, maximumOdds=5), original(1, 2))
        self.assertGreater(len(report['candidates']), 0)
        self.assertTrue(any('Added' in notice for notice in report['notices']))
        self.assertFalse(report['needsExpansion'])

    def test_original_only_never_adds_games(self):
        pool = [selection(1, 1.2, .8), selection(2, 1.2, .8), selection(3), selection(4)]
        report = generate_report(pool, Config(numberOfSlips=2, minimumOdds=3, maximumOdds=5,
                                             fixtureMode='original_only'), original(1, 2))
        self.assertEqual(report['candidates'], [])
        self.assertFalse(report['needsExpansion'])

    def test_market_preferences_fall_back_but_only_does_not(self):
        pool = [selection(i) for i in range(3)]
        config = Config(numberOfSlips=2, minimumOdds=3, maximumOdds=5,
                        marketQueries=['5 minute draw'], marketRules=[MarketRule(marketId='interval')])
        report = generate_report(pool, config, [])
        self.assertGreater(len(report['candidates']), 0)
        self.assertTrue(any('not available' in message for message in report['notices']))
        strict = generate_report(pool, config.model_copy(update={'marketPolicy': 'only'}), [])
        self.assertEqual(strict['candidates'], [])

    def test_nearest_odds_require_explicit_permission_and_are_reported(self):
        pool = [selection(i) for i in range(4)]
        config = Config(numberOfSlips=2, minimumOdds=10, maximumOdds=20, maximumSelections=2)
        self.assertEqual(generate_report(pool, config, [])['candidates'], [])
        report = generate_report(pool, config.model_copy(update={'allowOddsAdjustment': True}), [])
        self.assertEqual(len(report['candidates']), 2)
        self.assertEqual(report['effectiveConfig']['minimumOdds'], 4)
        self.assertTrue(any('nearest-odds' in notice for notice in report['notices']))

    def test_returns_partial_results_instead_of_discarding_them(self):
        report = generate_report([selection(1)], Config(numberOfSlips=10, minimumOdds=1.1,
                                 maximumOdds=5, minimumSelections=1), [])
        self.assertEqual(len(report['candidates']), 1)
        self.assertTrue(any('Found 1 of 10' in notice for notice in report['notices']))

    def test_exclusions_dates_probability_and_leagues_are_hard_limits(self):
        pool = [selection(i) for i in range(5)]
        pool[0].league = 'Excluded League'
        pool[1].probability = .1
        pool[2].homeTeam = 'Arsenal'
        pool[3].kickoffAt = datetime(2099, 1, 3, tzinfo=timezone.utc)
        config = Config(numberOfSlips=10, minimumOdds=1.1, maximumOdds=20, minimumSelections=1,
                        excludedTeams=['Arsenal'], excludedLeagues=['Excluded'], minimumProbability=.3,
                        kickoffBefore='2099-01-02T00:00:00Z')
        report = generate_report(pool, config, [])
        self.assertEqual({s['eventId'] for c in report['candidates'] for s in c['selections']}, {'4'})

    def test_requests_expansion_when_original_pool_cannot_fill_request(self):
        report = generate_report([selection(1, 1.2), selection(2, 1.2)],
                                 Config(numberOfSlips=10, minimumOdds=100, maximumOdds=500), original(1, 2))
        self.assertTrue(report['needsExpansion'])

    def test_preserve_picks_does_not_change_or_omit_original_outcomes(self):
        pool = [selection(1), selection(2), selection(3), selection(1, 3, .3, outcome='3')]
        report = generate_report(pool, Config(numberOfSlips=1, minimumOdds=7, maximumOdds=9,
                                             preserveOriginalSelections=True), original(1, 2))
        self.assertEqual(len(report['candidates']), 1)
        keys = {(s['eventId'], s['outcomeId']) for s in report['candidates'][0]['selections']}
        self.assertTrue({('1', '1'), ('2', '1')} <= keys)

    def test_required_team_is_included_without_excluding_every_other_team(self):
        pool = [selection(i) for i in range(8)]
        report = generate_report(pool, Config(numberOfSlips=3, minimumOdds=3, maximumOdds=10,
                                 includedTeams=['Home 2']), [])
        self.assertEqual(len(report['candidates']), 1)
        self.assertTrue(all(any(s['homeTeam'] == 'Home 2' for s in c['selections']) for c in report['candidates']))

    def test_preserved_picks_can_be_kept_in_a_large_expanded_pool(self):
        pool = [selection(i) for i in range(80)]
        report = generate_report(pool, Config(numberOfSlips=2, minimumOdds=16, maximumOdds=16,
                                 minimumSelections=4, maximumSelections=4, preserveOriginalSelections=True), original(0, 1, 2))
        self.assertEqual(len(report['candidates']), 2)
        self.assertTrue(all({'0', '1', '2'} <= {s['eventId'] for s in c['selections']} for c in report['candidates']))


class CatalogTests(unittest.TestCase):
    def test_interval_draw_matches_actual_catalog_ids(self):
        catalog = [{'marketId': '900', 'marketName': '1X2 - First 5 minutes', 'specifier': '',
                    'outcomes': [{'outcomeId': 'draw-id', 'outcomeName': 'Draw'}, {'outcomeId': 'home-id', 'outcomeName': 'Home'}]}]
        result = resolve_preferences(Config(marketQueries=['5 minute draw'], marketPolicy='only'), catalog)
        self.assertEqual(result.marketRules[0].marketId, '900')
        self.assertEqual(result.marketRules[0].outcomeIds, ['draw-id'])

    def test_invented_ids_are_discarded(self):
        catalog = [{'marketId': '900', 'marketName': 'Interval', 'specifier': '', 'outcomes': []}]
        result = resolve_preferences(Config(marketRules=[MarketRule(marketId='invented')]), catalog)
        self.assertEqual(result.marketRules, [])
        self.assertTrue(result.unhandledRequests)

    def test_generic_markets_are_scored_from_real_prices_and_identified_as_baseline(self):
        fixture = Fixture(eventId='1', homeTeam='A', awayTeam='B', league='L', kickoffAt='2099-01-01T00:00:00Z',
                          markets=[{'marketId': '900', 'marketName': '5 minute draw', 'outcomes': [
                              {'outcomeId': 'x', 'outcomeName': 'Draw', 'odds': 1.4, 'isActive': True}]}])
        scored = score_fixtures([fixture], OddsModel())
        self.assertEqual(scored[0].supportedMarket, Market.OTHER)
        self.assertEqual(scored[0].modelVersion, 'odds-raw-v1')
        self.assertAlmostEqual(scored[0].probability, 1 / 1.4, places=5)
        fixture.markets[0].status = '2'
        self.assertEqual(score_fixtures([fixture], OddsModel()), [])


if __name__ == '__main__':
    unittest.main()

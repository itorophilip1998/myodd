import unittest
from unittest.mock import patch
import httpx
from app.draw_markets import draw_request
from app.market_preferences import resolve_preferences
from app.generation import generate_report
from app.intent import parse_intent, _intent_cache
from app.schemas import Config, Market, MarketRule, ScoredSelection, Selection


def market(id, name, outcomes):
    return {'marketId': id, 'marketName': name, 'specifier': '', 'outcomes': [{'outcomeId': key, 'outcomeName': label} for key, label in outcomes]}

CATALOG = [
    market('full', '1X2', [('x', 'Draw'), ('h', 'Home')]),
    market('five', '1X2 from 1 to 5 minute', [('x', 'Draw')]),
    market('ten', '10 minutes - 1X2 from 1 to 10', [('x', 'Draw'), ('h', 'Home'), ('a', 'Away')]),
    market('twenty', '1X2 from 1 to 20 minute', [('x', 'Draw')]),
    market('score', 'Correct Score from 1 to 10 minute', [('00', '0:0'), ('11', '1:1'), ('12', '1:2')]),
    market('goals', 'Over/Under from 1 to 10 minute', [('u', 'Under 0.5'), ('o', 'Over 0.5')]),
    market('team', 'Home Team Total Goals from 1 to 10 minute', [('u', 'Under 0.5')]),
    market('dc', 'Double Chance from 1 to 10 minute', [('1x', 'Home or Draw')]),
    market('corners', 'Corners 1X2 from 1 to 10 minute', [('x', 'Draw')]),
    market('dnb', 'Draw No Bet', [('h', 'Home')]),
]


def pick(event, id, outcome='x', odds=1.3):
    m = next(m for m in CATALOG if m['marketId'] == id)
    label = next(o['outcomeName'] for o in m['outcomes'] if o['outcomeId'] == outcome)
    return ScoredSelection(eventId=str(event), marketId=id, outcomeId=outcome, specifier='', odds=odds,
        marketName=m['marketName'], selectionName=label, homeTeam='A', awayTeam='B', league='L',
        kickoffAt='2099-01-01T00:00:00Z', supportedMarket=Market.DRAW if id == 'full' else Market.OTHER,
        probability=1/odds, confidence=60, modelVersion='test')


def config(**kwargs):
    return resolve_preferences(Config(numberOfSlips=2, minimumOdds=1, maximumOdds=10,
        minimumSelections=1, maximumSelections=2, **kwargs), CATALOG, 'Create tickets with 1-10 draws')


class DrawIntentTests(unittest.TestCase):
    def test_shorthand_and_explicit_minutes_preserve_the_period(self):
        for prompt in ['1-10 draws', 'draws in the first 10 minutes', 'draw from 1 to 10 minutes', 'First 1–10 minute draws between 1 and 10 odds']:
            self.assertEqual(draw_request(prompt), ('minutes', 1, 10))
        self.assertEqual(draw_request('draw tickets between 1 and 10 odds'), ('full',))
        self.assertIsNone(draw_request('No draws, use home wins'))

    def test_a_model_cannot_turn_ten_minute_draws_into_different_markets(self):
        result = config(markets=[Market.HOME, Market.DRAW], marketRules=[MarketRule(marketId='twenty', outcomeIds=['x'])],
            relatedMarketRules=[MarketRule(marketId='dc')])
        self.assertEqual(result.marketPolicy, 'only')
        self.assertEqual(result.markets, [])
        self.assertEqual((result.minimumOdds, result.maximumOdds), (1, None))
        self.assertEqual([(r.marketId,r.outcomeIds) for r in result.marketRules], [('ten',['x'])])
        self.assertEqual([(r.marketId,r.outcomeIds) for r in result.relatedMarketRules], [('score',['00','11']),('goals',['u'])])

    def test_prefers_exact_draws_over_narrower_alternatives(self):
        pool = [pick(i, 'ten') for i in range(3)] + [pick(i, 'goals', 'u', 1.01) for i in range(3)]
        report = generate_report(pool, config(), [])
        self.assertEqual(len(report['candidates']), 2)
        self.assertTrue(all(s['marketId'] == 'ten' for c in report['candidates'] for s in c['selections']))

    def test_missing_interval_draws_never_become_fulltime_wins_or_other_periods(self):
        report = generate_report([pick(1,'full'),pick(2,'five'),pick(3,'twenty'),pick(4,'dc','1x'),pick(5,'ten','h')], config(), [])
        self.assertEqual(report['candidates'], [])

    def test_same_period_nogoal_alternative_is_disclosed(self):
        report = generate_report([pick(i,'goals','u') for i in range(3)], config(), [])
        self.assertEqual(len(report['candidates']), 2)
        self.assertTrue(all(s['marketId']=='goals' for c in report['candidates'] for s in c['selections']))
        self.assertTrue(any('narrower bets' in n for n in report['notices']))

    def test_searches_more_fixtures_before_using_related_alternatives(self):
        original = [Selection(eventId='1',marketId='full',outcomeId='h')]
        pool = [pick(1,'goals','u')]
        report = generate_report(pool, config(), original)
        self.assertTrue(report['needsExpansion'])
        self.assertEqual(report['candidates'], [])
        expanded = generate_report(pool, config(), original, expansion_attempted=True)
        self.assertFalse(expanded['needsExpansion'])
        self.assertEqual(len(expanded['candidates']), 1)

    def test_exact_market_only_disallows_related_bets(self):
        strict = resolve_preferences(Config(), CATALOG, 'Only use the requested markets: 1-10 draws. No alternatives.')
        self.assertEqual(strict.relatedMarketRules, [])

    @patch.dict('os.environ', {'AI_PROVIDER':'groq','AI_API_KEY':'test-secret'})
    @patch('app.groq.httpx.post')
    def test_shorthand_interval_draws_survive_provider_rate_limits(self, post):
        _intent_cache.clear()
        post.return_value = httpx.Response(429)
        result = parse_intent('Create 2 tickets with 1-10 draws. Exactly 3 games per ticket.', CATALOG)
        self.assertEqual(result.numberOfSlips, 2)
        self.assertEqual(result.minimumSelections, 3)
        self.assertEqual([r.marketId for r in result.marketRules], ['ten'])
        self.assertEqual(result.marketPolicy, 'only')

class IntervalScoringTests(unittest.TestCase):
    def fixture(self):
        from app.schemas import Fixture
        return Fixture(eventId='1', homeTeam='A', awayTeam='B', league='L', kickoffAt='2099-01-01T00:00:00Z', markets=[
            {'marketId':'ten','marketName':'10 minutes - 1X2 from 1 to 10','outcomes':[
                {'outcomeId':'h','outcomeName':'Home','odds':10,'isActive':True},
                {'outcomeId':'x','outcomeName':'Draw','odds':1.2,'isActive':True},
                {'outcomeId':'a','outcomeName':'Away','odds':10,'isActive':True}]}])

    def test_complete_interval_prices_remove_the_three_way_margin(self):
        from app.predictions import OddsModel, score_fixtures
        pool = score_fixtures([self.fixture()], OddsModel())
        self.assertAlmostEqual(sum(s.probability for s in pool), 1, places=5)
        self.assertAlmostEqual(pool[1].probability, (1/1.2)/(1/10+1/1.2+1/10), places=5)
        self.assertTrue(all(s.modelVersion == 'odds-interval-v1' for s in pool))

    def test_missing_outcomes_cannot_create_false_normalized_certainty(self):
        from app.predictions import OddsModel, score_fixtures
        fixture = self.fixture()
        fixture.markets[0].outcomes[0].isActive = False
        pool = score_fixtures([fixture], OddsModel())
        self.assertTrue(all(s.modelVersion == 'odds-raw-v1' for s in pool))
        self.assertAlmostEqual(pool[0].probability, 1/1.2, places=5)

    def test_conditional_early_payouts_are_not_treated_as_exclusive_results(self):
        from app.predictions import complete_interval_result
        fixture = self.fixture()
        fixture.markets[0].marketName += ' - 1UP'
        self.assertFalse(complete_interval_result(fixture.markets[0]))

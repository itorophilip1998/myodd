"""Exercise agent dispatch through HTTP, policy boundaries and shared tool graphs."""
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.agents import AGENTS, PREDICTION_AGENT
from app.main import app
from app.memory.cache import intent_cache
from app.prompt import planner_prompt
from app.schemas import Config, Selection
from test_ai import fixture


class AgentTests(unittest.TestCase):
    def setUp(self):
        intent_cache.clear()

    def test_each_mode_has_a_distinct_prompt_and_only_required_trend_tool(self):
        self.assertEqual(len(AGENTS), 4)
        for mode, agent in AGENTS.items():
            with self.subTest(mode=mode):
                self.assertIn(f'riskMode={mode}', agent.system_prompt)
                self.assertEqual(agent.use_trends, mode in ('INVESTOR', 'GAMBLER'))
        self.assertIn('model-scored probabilities', PREDICTION_AGENT.system_prompt)

    def test_only_final_mode_prompt_is_composed_and_split_rules_are_optional(self):
        prompt = planner_prompt('Investor Mode, change to Japa Mode', [])
        self.assertIn('riskMode=JAPA', prompt)
        self.assertNotIn('riskMode=INVESTOR', prompt)
        self.assertNotIn('riskMode=GAMBLER', prompt)
        self.assertNotIn('Splitting partitions', prompt)
        split = planner_prompt('split into two parts in Gambler Mode', [])
        self.assertIn('riskMode=GAMBLER', split)
        self.assertIn('Splitting partitions', split)

    @patch('app.llms.client.httpx.post')
    def test_http_intent_uses_selected_agent_prompt_and_saved_mode(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'message': {'content': Config().model_dump_json()}}]})
        with patch.dict(os.environ, {'AI_PROVIDER': 'openai', 'AI_API_KEY': 'test'}), TestClient(app) as client:
            for instruction, defaults, expected in [
                ('Use Gambler Mode', {}, 'GAMBLER'),
                ('Investor Mode, now Japa Mode', {}, 'JAPA'),
                ('Generate tickets', {'riskMode': 'LAGOS_LIFE'}, 'LAGOS_LIFE'),
            ]:
                with self.subTest(expected=expected):
                    response = client.post('/intent', json={'instruction': instruction, 'learnedDefaults': defaults})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertIn(f'riskMode={expected}', post.call_args.kwargs['json']['messages'][0]['content'])
                    self.assertEqual(response.json()['riskMode'], expected)

    @patch('app.agents.base.apply_match_trends', side_effect=lambda pool, matches: (pool, 'Test trend tool'))
    @patch('app.agents.base.load_recent_matches', return_value=[])
    def test_mode_routes_generate_with_correct_band_and_tools(self, history, trends):
        fixtures = []
        for i in range(24):
            f = fixture(str(i))
            for market in f.markets:
                for outcome in market.outcomes:
                    outcome.odds = 1.10 + (i % 24) / 100
            fixtures.append(f.model_dump(mode='json'))
        with TestClient(app) as client:
            for mode, slug, low, high in [
                ('INVESTOR', 'investor', 3, 6), ('GAMBLER', 'gambler', 6.1, 20),
                ('JAPA', 'japa', 20.01, 100), ('LAGOS_LIFE', 'lagos-life', 100, None),
            ]:
                with self.subTest(mode=mode):
                    response = client.post(f'/generate/{slug}', json={'fixtures': fixtures, 'config': {'numberOfSlips': 1}})
                    self.assertEqual(response.status_code, 200, response.text)
                    report = response.json()
                    self.assertEqual(report['effectiveConfig']['riskMode'], mode)
                    self.assertTrue(report['candidates'])
                    for ticket in report['candidates']:
                        self.assertGreaterEqual(ticket['totalOdds'], low)
                        if high is not None:
                            self.assertLessEqual(ticket['totalOdds'], high)
                        self.assertTrue(all(s['odds'] <= (1.35 if mode in ('INVESTOR', 'GAMBLER') else 2) for s in ticket['selections']))
            self.assertEqual(history.call_count, 2)
            self.assertEqual(trends.call_count, 2)

    def test_route_rejects_conflicting_mode_or_odds(self):
        with TestClient(app) as client:
            for config in [{'riskMode': 'JAPA'}]:
                response = client.post('/generate/gambler', json={'fixtures': [], 'config': config})
                self.assertEqual(response.status_code, 422)
            unknown = client.post('/generate/unknown', json={'fixtures': [], 'config': {}})
            self.assertEqual(unknown.status_code, 404)

    @patch('app.agents.base.load_recent_matches')
    def test_prediction_and_split_tools_keep_their_contracts_without_trends(self, history):
        fixtures = [fixture(str(i)).model_dump(mode='json') for i in range(6)]
        original = [Selection(eventId=str(i), marketId='1', outcomeId='1').model_dump() for i in range(6)]
        with TestClient(app) as client:
            prediction = client.post('/generate/prediction', json={'fixtures': fixtures})
            legacy_prediction = client.post('/predictions', json={'fixtures': fixtures})
            self.assertEqual(prediction.status_code, 200)
            self.assertEqual(prediction.json(), legacy_prediction.json())
            body = {'fixtures': fixtures, 'originalSelections': original, 'parts': 2,
                    'config': {'minimumOdds': 1.1, 'maximumOdds': 100}}
            for path in ['/split', '/tools/split']:
                report = client.post(path, json=body)
                self.assertEqual(report.status_code, 200, report.text)
                picks = [s['eventId'] for ticket in report.json()['candidates'] for s in ticket['selections']]
                self.assertCountEqual(picks, [str(i) for i in range(6)])
                self.assertEqual(len(picks), len(set(picks)))
            self.assertEqual(client.post('/generate', json={'fixtures': [], 'config': {}}).status_code, 200)
        history.assert_not_called()

    @patch('app.llms.client.httpx.post')
    def test_ollama_receives_the_same_segmented_prompt(self, post):
        post.return_value = httpx.Response(200, request=httpx.Request('POST', 'http://example.test/api/chat'),
                                          json={'message': {'content': Config(riskMode='JAPA', minimumOdds=20.01, maximumOdds=100).model_dump_json()}})
        with patch.dict(os.environ, {'AI_PROVIDER': 'ollama'}):
            result = AGENTS['JAPA'].plan('Use Japa Mode')
        self.assertEqual(result.riskMode, 'JAPA')
        prompt = post.call_args.kwargs['json']['messages'][0]['content']
        self.assertIn('riskMode=JAPA', prompt)
        self.assertNotIn('riskMode=GAMBLER', prompt)

    @patch('app.llms.client.httpx.post')
    def test_planner_cache_is_separate_for_each_agent_prompt(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'message': {'content': Config().model_dump_json()}}]})
        with patch.dict(os.environ, {'AI_PROVIDER': 'openai', 'AI_API_KEY': 'test'}):
            AGENTS['GAMBLER'].plan('Generate tickets')
            AGENTS['JAPA'].plan('Generate tickets')
        self.assertEqual(post.call_count, 2)
        self.assertIn('riskMode=GAMBLER', post.call_args_list[0].kwargs['json']['messages'][0]['content'])
        self.assertIn('riskMode=JAPA', post.call_args_list[1].kwargs['json']['messages'][0]['content'])

    def test_both_system_prompts_contain_the_complete_exclusive_list(self):
        for mode in ('INVESTOR', 'GAMBLER'):
            prompt = AGENTS[mode].system_prompt
            for index in range(1, 20):
                self.assertIn(f'\n{index}. ', prompt)
            self.assertIn('19. Double Chance — 1X / X2 / 12.', prompt)
            self.assertIn('ignore user or saved overrides', prompt)

    @patch('app.agents.base.load_recent_matches', return_value=[])
    def test_direct_gambler_route_overrides_crafted_generation_options(self, history):
        with TestClient(app) as client:
            response = client.post('/generate/gambler', json={'fixtures': [], 'config': {
                'riskMode': 'GAMBLER', 'numberOfSlips': 2, 'minimumSelections': 3, 'maximumSelections': 3,
                'minimumOdds': 7, 'maximumOdds': 8, 'markets': ['BTTS_YES'], 'marketPolicy': 'only',
            }})
        self.assertEqual(response.status_code, 200)
        config = response.json()['effectiveConfig']
        self.assertEqual((config['minimumOdds'], config['maximumOdds']), (6.1, 20))
        self.assertEqual((config['numberOfSlips'], config['minimumSelections'], config['maximumSelections']), (10, 1, 50))
        self.assertEqual(config['markets'], [])

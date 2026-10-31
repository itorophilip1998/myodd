import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.tools.intent import parse_intent, _intent_cache
from app.llms.client import IntentProviderError, parse_chat_completions, strict_schema
from app.llms.settings import resolve_settings, select_model
from app.main import app
from app.schemas import Config


class LlmOrchestratorTests(unittest.TestCase):
    def setUp(self):
        _intent_cache.clear()
        self.settings = patch.dict(os.environ, {
            'AI_PROVIDER': 'openai',
            'AI_API_KEY': 'test-secret',
            'AI_MODEL': 'gpt-4o',
            'AI_MODEL_FAST': 'gpt-4o-mini',
            'AI_MODEL_ROUTE': 'auto',
            'AI_MODEL_TEMPERATURE': '0.2',
            'PREDICTION_MODEL': 'odds',
            'OPENAI_API_KEY': '',
            'OPENAI_MODEL': '',
            'AI_BASE_URL': '',
        }, clear=False)
        self.settings.start()
        self.addCleanup(self.settings.stop)

    def test_schema_requires_every_field_and_disallows_unknown_fields(self):
        schema = strict_schema()
        self.assertEqual(set(schema['required']), set(schema['properties']))
        self.assertFalse(schema['additionalProperties'])
        self.assertNotIn('default', schema['properties']['numberOfSlips'])

    def test_resolves_openai_defaults_and_key_aliases(self):
        with patch.dict(os.environ, {'AI_PROVIDER': 'openai', 'AI_API_KEY': '', 'OPENAI_API_KEY': 'alias-key',
                                     'AI_MODEL': '', 'OPENAI_MODEL': 'gpt-4o', 'AI_MODEL_FAST': 'gpt-4o-mini',
                                     'AI_BASE_URL': ''}):
            settings = resolve_settings()
        self.assertEqual(settings.provider, 'openai')
        self.assertEqual(settings.accurate_model, 'gpt-4o')
        self.assertEqual(settings.fast_model, 'gpt-4o-mini')
        self.assertEqual(settings.api_key, 'alias-key')
        self.assertEqual(settings.base_url, 'https://api.openai.com/v1')

    def test_custom_base_url_is_honored(self):
        with patch.dict(os.environ, {'AI_PROVIDER': 'openai', 'AI_BASE_URL': 'https://example.test/v1/'}):
            self.assertEqual(resolve_settings().base_url, 'https://example.test/v1')

    def test_auto_route_uses_fast_for_simple_and_accurate_for_markets(self):
        self.assertEqual(select_model('Create 5 tickets using Investor Mode'), 'gpt-4o-mini')
        self.assertEqual(select_model('Create 5 tickets with 1-10 draws and double chance'), 'gpt-4o')
        with patch.dict(os.environ, {'AI_MODEL_ROUTE': 'accurate'}):
            self.assertEqual(select_model('Create 5 tickets using Investor Mode'), 'gpt-4o')
        with patch.dict(os.environ, {'AI_MODEL_ROUTE': 'fast'}):
            self.assertEqual(select_model('Create 5 tickets with 1-10 draws'), 'gpt-4o-mini')

    @patch('app.llms.client.httpx.post')
    def test_openai_uses_selected_model_and_validates_output(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=7).model_dump_json()}}]})
        result = parse_intent('Create seven slips')
        self.assertEqual(result.numberOfSlips, 7)
        args = post.call_args.kwargs
        self.assertEqual(post.call_args.args[0], 'https://api.openai.com/v1/chat/completions')
        self.assertEqual(args['json']['model'], 'gpt-4o-mini')
        self.assertEqual(args['json']['temperature'], .2)
        self.assertEqual(args['json']['max_tokens'], 1024)
        self.assertNotIn('reasoning_effort', args['json'])
        self.assertTrue(args['json']['response_format']['json_schema']['strict'])
        self.assertNotIn('test-secret', str(args['json']))

    @patch('app.llms.client.httpx.post')
    def test_complex_prompt_uses_accurate_model(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=3).model_dump_json()}}]})
        parse_intent('Create 3 slips with 1-10 draws. Prefer double chance.')
        self.assertEqual(post.call_args.kwargs['json']['model'], 'gpt-4o')
        self.assertEqual(post.call_args.kwargs['json']['max_tokens'], 1536)

    @patch('app.llms.client.httpx.post')
    def test_gpt5_uses_completion_tokens_without_temperature(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=2).model_dump_json()}}]})
        with patch.dict(os.environ, {'AI_MODEL': 'gpt-5.6-sol', 'AI_MODEL_FAST': 'gpt-5.6-terra', 'AI_MODEL_ROUTE': 'fast'}):
            parse_intent('Create two slips')
        args = post.call_args.kwargs['json']
        self.assertEqual(args['model'], 'gpt-5.6-terra')
        self.assertNotIn('temperature', args)
        self.assertEqual(args['max_completion_tokens'], 1024)
        self.assertEqual(args['reasoning_effort'], 'none')

    @patch('app.llms.client.httpx.post')
    def test_model_not_found_names_the_model(self, post):
        post.return_value = httpx.Response(403, json={'error': {'code': 'model_not_found', 'message': 'no access'}})
        with self.assertRaises(IntentProviderError) as ctx:
            parse_chat_completions('Create seven slips')
        self.assertIn('gpt-4o-mini', str(ctx.exception))

    @patch('app.llms.client.httpx.post')
    def test_groq_provider_keeps_provider_specific_request_fields(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=3).model_dump_json()}}]})
        with patch.dict(os.environ, {'AI_PROVIDER': 'groq', 'AI_MODEL': 'qwen/qwen3.8-27b', 'AI_MODEL_FAST': 'qwen/qwen3.8-27b'}):
            parse_intent('Create three slips')
        args = post.call_args.kwargs
        self.assertEqual(post.call_args.args[0], 'https://api.groq.com/openai/v1/chat/completions')
        self.assertIn(args['json']['max_completion_tokens'], (1024, 1536))
        self.assertEqual(args['json']['reasoning_effort'], 'none')

    @patch('app.llms.client.httpx.post')
    def test_strict_provider_failure_recovers_with_locally_validated_json(self, post):
        post.side_effect = [httpx.Response(400, json={'error': {'code': 'json_validate_failed'}}),
                            httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=10).model_dump_json()}}]})]
        self.assertEqual(parse_chat_completions('Create 10 slips').numberOfSlips, 10)
        self.assertEqual(post.call_args_list[1].kwargs['json']['response_format']['type'], 'json_object')

    @patch('app.llms.client.httpx.post')
    def test_incomplete_objects_cannot_silently_apply_defaults(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': '{}'}}]})
        with self.assertRaises(IntentProviderError):
            parse_chat_completions('Create 50 slips')

    @patch('app.llms.client.httpx.post')
    def test_rate_limit_can_use_a_faithful_numeric_request_fallback(self, post):
        post.return_value = httpx.Response(429)
        result = parse_intent('Create 10 lower variance slips between 3 and 5 odds. Prefer double chance.')
        self.assertEqual(result.numberOfSlips, 10)
        self.assertEqual((result.minimumOdds, result.maximumOdds), (3, 5))
        self.assertEqual(result.riskMode, 'INVESTOR')
        self.assertTrue(any('local parser' in message for message in result.unhandledRequests))

    @patch('app.llms.client.httpx.post')
    def test_unknown_hard_constraints_do_not_use_a_guessing_fallback(self, post):
        post.return_value = httpx.Response(429)
        with self.assertRaises(IntentProviderError):
            parse_intent('Create 10 slips between 3 and 5 odds. Only tomorrow before noon.')

    @patch('app.llms.client.httpx.post')
    def test_mode_controls_work_during_a_provider_outage(self, post):
        post.return_value = httpx.Response(502)
        result = parse_intent('Create a ticket using Lagoslife Mode. Upcoming games are allowed.\nFinal request settings (take precedence): Generate 1 tickets. Exactly 4 games per ticket.')
        self.assertEqual((result.riskMode, result.numberOfSlips, result.minimumSelections, result.maximumSelections), ('LAGOS_LIFE', 1, 4, 4))
        self.assertEqual(result.minimumOdds, 100)
        self.assertIsNone(result.maximumOdds)
        self.assertTrue(any('local parser' in note for note in result.unhandledRequests))

    @patch('app.llms.client.httpx.post')
    def test_investor_fallback_keeps_the_fixed_band(self, post):
        post.return_value = httpx.Response(429)
        result = parse_intent('Create tickets using Investor Mode with odds at least 8.')
        self.assertEqual((result.riskMode, result.minimumOdds, result.maximumOdds, result.markets), ('INVESTOR', 3, 6, []))

    @patch('app.llms.client.httpx.post')
    def test_cache_is_separate_for_different_market_catalogs(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config().model_dump_json()}}]})
        parse_intent('Create 3 slips', [])
        parse_intent('Create 3 slips', [{'marketId': '10', 'marketName': 'Double Chance', 'outcomes': []}])
        self.assertEqual(post.call_count, 2)

    @patch('app.llms.client.httpx.post')
    def test_repeated_interpretation_is_cached(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=7).model_dump_json()}}]})
        parse_intent('Create seven slips')
        parse_intent('Create seven slips')
        self.assertEqual(post.call_count, 1)

    @patch('app.llms.client.httpx.post')
    def test_request_size_limit_retries_with_a_smaller_catalog(self, post):
        post.side_effect = [httpx.Response(413), httpx.Response(200, json={'choices': [
            {'finish_reason': 'stop', 'message': {'content': Config().model_dump_json()}}]})]
        catalog = [{'marketId': str(i), 'marketName': 'Double chance', 'specifier': '', 'outcomes': []} for i in range(8)]
        parse_chat_completions('Create 3 slips', catalog)
        self.assertEqual(post.call_count, 2)
        first = post.call_args_list[0].kwargs['json']['messages'][0]['content']
        second = post.call_args_list[1].kwargs['json']['messages'][0]['content']
        self.assertLess(len(second), len(first))

    @patch('app.llms.client.httpx.post')
    def test_provider_error_does_not_expose_key_or_response_body(self, post):
        post.return_value = httpx.Response(401, json={'error': 'test-secret'})
        with self.assertRaises(IntentProviderError) as raised:
            parse_chat_completions('Create seven slips')
        self.assertNotIn('test-secret', str(raised.exception))

    @patch('app.llms.client.httpx.post')
    def test_invalid_model_output_is_rejected(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': '{"numberOfSlips": 999}'}}]})
        with self.assertRaises(IntentProviderError):
            parse_chat_completions('Create seven slips')

    @patch('app.llms.client.httpx.post')
    def test_truncated_output_is_rejected(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'length', 'message': {'content': '{}'}}]})
        with self.assertRaises(IntentProviderError):
            parse_chat_completions('Create seven slips')

    def test_investor_without_an_api_key_uses_the_local_parser(self):
        with patch.dict(os.environ, {'AI_PROVIDER': 'openai', 'AI_API_KEY': '', 'OPENAI_API_KEY': ''}), patch('app.llms.client.httpx.post') as post:
            result = parse_intent('Create tickets for today.\nFinal request settings (take precedence): Investor Mode system ticket. Risk mode: Investor Mode.')
            post.assert_not_called()
            self.assertEqual((result.riskMode, result.minimumOdds, result.maximumOdds), ('INVESTOR', 3, 6))
            self.assertTrue(any('no API key' in note for note in result.unhandledRequests))

    def test_missing_credentials_fail_without_http(self):
        with patch.dict(os.environ, {'AI_API_KEY': '', 'OPENAI_API_KEY': ''}), patch('app.llms.client.httpx.post') as post:
            with self.assertRaises(IntentProviderError):
                parse_chat_completions('Create seven slips')
            post.assert_not_called()

    @patch('app.llms.client.httpx.post')
    def test_provider_failure_is_a_sanitized_gateway_error(self, post):
        post.return_value = httpx.Response(429, json={'error': 'test-secret'})
        with TestClient(app) as client:
            response = client.post('/intent', json={'instruction': 'Create seven slips'})
            self.assertEqual(response.status_code, 502)
            self.assertNotIn('test-secret', response.text)
            health = client.get('/health').json()
            self.assertEqual(health['intentProvider'], 'openai')
            self.assertEqual(health['intentModel'], 'gpt-4o')
            self.assertEqual(health['intentModelFast'], 'gpt-4o-mini')
            self.assertEqual(health['intentModelRoute'], 'auto')


if __name__ == '__main__':
    unittest.main()

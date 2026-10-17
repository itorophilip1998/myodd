import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.groq import GroqIntentError, parse_groq, strict_schema
from app.intent import parse_intent, _intent_cache
from app.main import app
from app.schemas import Config


class GroqTests(unittest.TestCase):
    def setUp(self):
        _intent_cache.clear()
        self.settings = patch.dict(os.environ, {'AI_PROVIDER': 'groq', 'AI_API_KEY': 'test-secret', 'AI_MODEL': 'qwen/qwen3.8-27b', 'AI_MODEL_TEMPERATURE': '0.7', 'PREDICTION_MODEL': 'odds'})
        self.settings.start()
        self.addCleanup(self.settings.stop)

    def test_schema_requires_every_field_and_disallows_unknown_fields(self):
        schema = strict_schema()
        self.assertEqual(set(schema['required']), set(schema['properties']))
        self.assertFalse(schema['additionalProperties'])
        self.assertNotIn('default', schema['properties']['numberOfSlips'])

    @patch('app.groq.httpx.post')
    def test_groq_uses_selected_model_temperature_and_validates_output(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=7).model_dump_json()}}]})
        result = parse_intent('Create seven slips')
        self.assertEqual(result.numberOfSlips, 7)
        args = post.call_args.kwargs
        self.assertEqual(args['json']['model'], 'qwen/qwen3.8-27b')
        self.assertEqual(args['json']['temperature'], .7)
        self.assertTrue(args['json']['response_format']['json_schema']['strict'])
        self.assertNotIn('test-secret', str(args['json']))

    @patch('app.groq.httpx.post')
    def test_strict_provider_failure_recovers_with_locally_validated_json(self, post):
        post.side_effect = [httpx.Response(400, json={'error': {'code': 'json_validate_failed'}}),
                            httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=50).model_dump_json()}}]})]
        self.assertEqual(parse_groq('Create 50 slips').numberOfSlips, 50)
        self.assertEqual(post.call_args_list[1].kwargs['json']['response_format']['type'], 'json_object')

    @patch('app.groq.httpx.post')
    def test_incomplete_objects_cannot_silently_apply_defaults(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': '{}'}}]})
        with self.assertRaises(GroqIntentError):
            parse_groq('Create 50 slips')

    @patch('app.groq.httpx.post')
    def test_rate_limit_can_use_a_faithful_numeric_request_fallback(self, post):
        post.return_value = httpx.Response(429)
        result = parse_intent('Create 50 lower variance slips between 100 and 500 odds. Prefer double chance.')
        self.assertEqual(result.numberOfSlips, 50)
        self.assertEqual((result.minimumOdds, result.maximumOdds), (100, 500))
        self.assertTrue(any('local parser' in message for message in result.unhandledRequests))

    @patch('app.groq.httpx.post')
    def test_unknown_hard_constraints_do_not_use_a_guessing_fallback(self, post):
        post.return_value = httpx.Response(429)
        with self.assertRaises(GroqIntentError):
            parse_intent('Create 50 slips between 100 and 500 odds. Only tomorrow before noon.')

    @patch('app.groq.httpx.post')
    def test_mode_controls_work_during_a_provider_outage(self, post):
        post.return_value = httpx.Response(502)
        result = parse_intent('Create a ticket using Lagoslife Mode. Upcoming games are allowed.\nFinal request settings (take precedence): Generate 1 tickets. Exactly 4 games per ticket.')
        self.assertEqual((result.riskMode, result.numberOfSlips, result.minimumSelections, result.maximumSelections), ('LAGOS_LIFE', 1, 4, 4))
        self.assertEqual(result.minimumOdds, 500.01)
        self.assertIsNone(result.maximumOdds)
        self.assertTrue(any('local parser' in note for note in result.unhandledRequests))

    @patch('app.groq.httpx.post')
    def test_mode_fallback_rejects_unparsed_constraints(self, post):
        post.return_value = httpx.Response(429)
        with self.assertRaises(GroqIntentError):
            parse_intent('Create tickets using Investor Mode with odds at least 8.')

    @patch('app.groq.httpx.post')
    def test_cache_is_separate_for_different_market_catalogs(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config().model_dump_json()}}]})
        parse_intent('Create 3 slips', [])
        parse_intent('Create 3 slips', [{'marketId': '10', 'marketName': 'Double Chance', 'outcomes': []}])
        self.assertEqual(post.call_count, 2)

    @patch('app.groq.httpx.post')
    def test_repeated_interpretation_is_cached(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=7).model_dump_json()}}]})
        parse_intent('Create seven slips')
        parse_intent('Create seven slips')
        self.assertEqual(post.call_count, 1)

    @patch('app.groq.httpx.post')
    def test_request_size_limit_retries_with_a_smaller_catalog(self, post):
        post.side_effect = [httpx.Response(413), httpx.Response(200, json={'choices': [
            {'finish_reason': 'stop', 'message': {'content': Config().model_dump_json()}}]})]
        catalog = [{'marketId': str(i), 'marketName': 'Double chance', 'specifier': '', 'outcomes': []} for i in range(8)]
        parse_groq('Create 3 slips', catalog)
        self.assertEqual(post.call_count, 2)
        first = post.call_args_list[0].kwargs['json']['messages'][0]['content']
        second = post.call_args_list[1].kwargs['json']['messages'][0]['content']
        self.assertLess(len(second), len(first))

    @patch('app.groq.httpx.post')
    def test_provider_error_does_not_expose_key_or_response_body(self, post):
        post.return_value = httpx.Response(401, json={'error': 'test-secret'})
        with self.assertRaises(GroqIntentError) as raised:
            parse_groq('Create seven slips')
        self.assertNotIn('test-secret', str(raised.exception))

    @patch('app.groq.httpx.post')
    def test_invalid_model_output_is_rejected(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': '{"numberOfSlips": 999}'}}]})
        with self.assertRaises(GroqIntentError):
            parse_groq('Create seven slips')

    @patch('app.groq.httpx.post')
    def test_truncated_output_is_rejected(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'length', 'message': {'content': '{}'}}]})
        with self.assertRaises(GroqIntentError):
            parse_groq('Create seven slips')

    def test_missing_credentials_fail_without_http(self):
        with patch.dict(os.environ, {'AI_API_KEY': ''}), patch('app.groq.httpx.post') as post:
            with self.assertRaises(GroqIntentError):
                parse_groq('Create seven slips')
            post.assert_not_called()

    @patch('app.groq.httpx.post')
    def test_provider_failure_is_a_sanitized_gateway_error(self, post):
        post.return_value = httpx.Response(429, json={'error': 'test-secret'})
        with TestClient(app) as client:
            response = client.post('/intent', json={'instruction': 'Create seven slips'})
            self.assertEqual(response.status_code, 502)
            self.assertNotIn('test-secret', response.text)
            self.assertEqual(client.get('/health').json()['intentProvider'], 'groq')


if __name__ == '__main__':
    unittest.main()

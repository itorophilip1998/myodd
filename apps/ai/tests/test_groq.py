"""Compatibility coverage for the legacy groq import path."""
import os
import unittest
from unittest.mock import patch

import httpx

from app.groq import GroqIntentError, parse_groq, strict_schema
from app.schemas import Config


class GroqCompatTests(unittest.TestCase):
    def setUp(self):
        self.settings = patch.dict(os.environ, {
            'AI_PROVIDER': 'groq',
            'AI_API_KEY': 'test-secret',
            'AI_MODEL': 'qwen/qwen3.8-27b',
            'AI_MODEL_TEMPERATURE': '0.7',
        })
        self.settings.start()
        self.addCleanup(self.settings.stop)

    def test_schema_reexport(self):
        schema = strict_schema()
        self.assertEqual(set(schema['required']), set(schema['properties']))

    @patch('app.llm.httpx.post')
    def test_parse_groq_still_works(self, post):
        post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': Config(numberOfSlips=4).model_dump_json()}}]})
        self.assertEqual(parse_groq('Create 4 slips').numberOfSlips, 4)
        self.assertEqual(post.call_args.args[0], 'https://api.groq.com/openai/v1/chat/completions')

    @patch('app.llm.httpx.post')
    def test_error_alias(self, post):
        post.return_value = httpx.Response(401)
        with self.assertRaises(GroqIntentError):
            parse_groq('Create slips')


if __name__ == '__main__':
    unittest.main()

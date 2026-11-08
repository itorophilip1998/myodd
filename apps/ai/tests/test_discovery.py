import unittest
from unittest.mock import patch
from app.tools.discovery import extract_codes, extract_hub_codes, validate_public_url, discover, DiscoveryRequest
from fastapi import HTTPException

class DiscoveryTests(unittest.TestCase):
    def test_only_booking_evidence_is_extracted(self):
        html = '<script>code: FAKE123</script><a href="https://www.sportybet.com/ng/?shareCode=AB123C">Open</a><a href="https://evil.test/?shareCode=NO1234">x</a><p>booking code: ZX789A</p>'
        self.assertEqual(extract_codes(html), ['AB123C', 'ZX789A'])
    def test_hub_uses_only_structured_share_codes(self):
        self.assertEqual(extract_hub_codes({'bizCode': 10000, 'data': [{'shareCode': 'ABCDEF'}, {'shareCode': 'abcdef'}, {'shareCode': '../bad'}, {'userId': 'NO1234'}]}), ['ABCDEF'])
    def test_hub_rejects_error_payload(self):
        with self.assertRaises(ValueError): extract_hub_codes({'bizCode': 400, 'data': []})
    @patch('app.tools.discovery.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 443))])
    def test_local_destination_is_blocked(self, _):
        with self.assertRaises(ValueError): validate_public_url('https://localhost/data')
    def test_sources_are_allowlisted(self):
        with self.assertRaises(HTTPException): discover(DiscoveryRequest(sources=['https://unknown.test/']))

"""Bounded, read-only discovery from configured public sources. Scraped text is data, never instructions."""
import ipaddress
import json
import os
import re
import socket
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, parse_qs
from urllib.robotparser import RobotFileParser

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

DEFAULT_SOURCE = 'https://www.sportybet.com/ng/m/code-hub/codes'
USER_AGENT = 'myOdd-CodeDiscovery/1.0'


class DiscoveryRequest(BaseModel):
    sources: list[str] = Field(default_factory=list, max_length=8)


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        if tag == 'a':
            href = dict(attrs).get('href')
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
        if tag in ('p', 'div', 'br', 'article', 'li', 'h4', 'span', 'code'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def extract_codes(html: str, source_url: str = ""):
    page = Page()
    page.feed(html)
    candidates = []
    for href in page.links:
        parsed = urlparse(href)
        # A converter's unrelated links and referral codes are not booking-code evidence.
        if (parsed.hostname or '').lower().removeprefix('www.') != 'sportybet.com':
            continue
        query = parse_qs(parsed.query)
        for key in ('shareCode', 'customCode', 'sharecode'):
            candidates += query.get(key, [])
    link_codes = set(candidates)
    text = ' '.join(''.join(page.parts).split())
    candidates += re.findall(r'\b(?:booking\s*code|sportybet\s*code|code)\s*[:：]\s*([A-Za-z0-9_]{4,32})\b', text, re.I)
    valid = []
    for code in candidates:
        normalized = code.strip().upper()
        # Standard short codes must contain both letters and digits; named aliases need a share URL.
        if re.fullmatch(r'[A-Z0-9_]{4,32}', normalized) and normalized not in valid:
            if code in link_codes or (re.search('[A-Z]', normalized) and re.search('[0-9]', normalized)):
                valid.append(normalized)
    return valid[:40]


def validate_public_url(url: str):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Sources must be public HTTPS URLs')
    addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise ValueError('Private or local crawl destinations are not allowed')
    return parsed


def read_page(client, url, limit=1_500_000):
    origin = validate_public_url(url)
    for _ in range(4):
        with client.stream('GET', url) as response:
            if response.is_redirect:
                destination = urljoin(url, response.headers.get('location', ''))
                parsed = validate_public_url(destination)
                if parsed.hostname != origin.hostname:
                    raise ValueError('Cross-host source redirects are not followed')
                url = destination
                continue
            response.raise_for_status()
            content = bytearray()
            for chunk in response.iter_bytes():
                content.extend(chunk)
                if len(content) > limit:
                    raise ValueError('Source exceeded the crawl size limit')
            return content.decode('utf-8', errors='replace')
    raise ValueError('Too many source redirects')


def extract_hub_codes(payload):
    if not isinstance(payload, dict) or payload.get('bizCode') != 10000 or not isinstance(payload.get('data'), list):
        raise ValueError('Unexpected Code Hub feed response')
    codes = []
    for item in payload['data'][:20]:
        code = item.get('shareCode') if isinstance(item, dict) else None
        if isinstance(code, str) and re.fullmatch(r'[A-Za-z0-9_]{3,32}', code) and code.upper() not in codes:
            codes.append(code.upper())
    return codes


def discover_source(url):
    try:
        parsed = validate_public_url(url)
        with httpx.Client(headers={'User-Agent': USER_AGENT}, timeout=20, follow_redirects=False) as client:
            robots = client.get(f'{parsed.scheme}://{parsed.netloc}/robots.txt')
            if robots.status_code == 200:
                policy = RobotFileParser()
                policy.parse(robots.text.splitlines())
                if not policy.can_fetch(USER_AGENT, url):
                    return {'url': url, 'codes': [], 'error': 'Source robots policy does not allow discovery'}
            elif robots.status_code not in (404, 410):
                return {'url': url, 'codes': [], 'error': 'Source robots policy could not be checked'}
            if parsed.hostname == 'www.sportybet.com' and parsed.path.rstrip('/') == '/ng/m/code-hub/codes':
                # Public featured-code feed used by the Code Hub's own frontend.
                # No account, cookies, browser automation or private endpoints are needed.
                codes = []
                for page in (1, 2):
                    endpoint = f'https://www.sportybet.com/api/ng/orders/bookingCode/featured?pageNum={page}&pageSize=20'
                    if robots.status_code == 200 and not policy.can_fetch(USER_AGENT, endpoint):
                        raise ValueError('Code Hub feed is disallowed by robots policy')
                    payload = json.loads(read_page(client, endpoint))
                    codes += extract_hub_codes(payload)
                return {'url': url, 'codes': list(dict.fromkeys(codes))[:40], 'error': None}
            html = read_page(client, url)
            return {'url': url, 'codes': extract_codes(html, url), 'error': None}
    except (httpx.HTTPError, ValueError, OSError):
        return {'url': url, 'codes': [], 'error': 'Source unavailable or blocked; no codes imported'}


def discover(request: DiscoveryRequest):
    allowed = [url.strip() for url in os.getenv('CODE_SOURCE_URLS', DEFAULT_SOURCE).split(',') if url.strip()]
    sources = request.sources or allowed
    if any(url not in allowed for url in sources):
        raise HTTPException(400, 'Only configured code sources can be crawled')
    with ThreadPoolExecutor(max_workers=3) as executor:
        return {'sources': list(executor.map(discover_source, sources[:8]))}

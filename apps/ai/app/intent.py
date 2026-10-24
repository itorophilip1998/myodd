import json
from .generation_limits import validate_ticket_count
import hashlib
import os
import re
import time
from datetime import datetime, timezone

import httpx

from .schemas import Config, Market
from .risk_modes import MODES, apply_default_investor, apply_named_mode
from .draw_markets import draw_request
from .llm import IntentProviderError, parse_chat_completions, resolve_provider_name, resolve_settings, select_model
from .market_preferences import resolve_preferences
from .odds_format import extract_games_per_ticket, extract_odds_bounds, has_safer_slang


def parse_rules(instruction: str) -> Config:
    text = instruction.lower()
    def number(pattern, default):
        match = re.search(pattern, text)
        return int(match[1]) if match else default

    data = {}
    data['numberOfSlips'] = validate_ticket_count(instruction) or 10
    low, high = extract_odds_bounds(instruction)
    if low is not None:
        data['minimumOdds'] = low
    if high is not None:
        data['maximumOdds'] = high
    data['maximumSelections'] = number(r'max(?:imum)?\s+(\d+)\s*(?:games?|matches?|selections?|legs?)', 50)
    data['minimumSelections'] = number(r'min(?:imum)?\s+(\d+)\s*(?:games?|matches?|selections?|legs?)', 1)
    data['riskPreference'] = 'HIGHER' if re.search(r'aggressive|high(?:er)?[- ]?(?:risk|variance|odds)|risky', text) else 'LOWER' if re.search(r'safer|conservative|low(?:er)?[- ]?(?:risk|variance)', text) else 'MODERATE'
    exact = extract_games_per_ticket(instruction)
    if exact is not None:
        data['minimumSelections'] = data['maximumSelections'] = exact
    markets = [Market.HOME, Market.DOUBLE_CHANCE_1X] if has_safer_slang(text) else []
    if has_safer_slang(text):
        data['riskPreference'] = 'LOWER'
        data['unhandledRequests'] = ['Safer-ranked selections are not a guaranteed win.']
    if re.search(r'double\s*chance|\b1x\b|\bx2\b', text):
        markets += [Market.DOUBLE_CHANCE_1X, Market.DOUBLE_CHANCE_X2, Market.DOUBLE_CHANCE_12]
    for pattern, market in [(r'over\s*1\.5', Market.OVER_1_5), (r'over\s*2\.5', Market.OVER_2_5), (r'under\s*3\.5', Market.UNDER_3_5)]:
        if re.search(pattern, text):
            markets.append(market)
    if re.search(r'btts|both\s*teams', text):
        markets += [Market.BTTS_NO] if re.search(r'btts\s*no|both teams.*not.*score', text) else [Market.BTTS_YES] if re.search(r'btts\s*yes', text) else [Market.BTTS_YES, Market.BTTS_NO]
    no_wins = re.search(r"(?:don't use|no|exclude|without)\s+(?:straight wins?|moneyline)", text)
    if re.search(r'straight\s*wins?|home\s*win|favourites?|favorites?', text) and not no_wins:
        markets += [Market.HOME, Market.AWAY]
    if no_wins and not markets:
        markets = [Market.DOUBLE_CHANCE_1X, Market.DOUBLE_CHANCE_X2, Market.OVER_1_5]
    if markets:
        data['markets'] = list(dict.fromkeys(markets))
    excluded = re.search(r'(?:remove|exclude|avoid)\s+(.+?)(?:[.;\n]|\s+(?:and then|with|before|after)\b|$)', instruction, re.I)
    if excluded and not re.match(r'straight wins?|moneyline', excluded[1], re.I):
        data['excludedTeams'] = [x.strip() for x in re.split(r',|\s+and\s+', excluded[1]) if x.strip()]
    deadline = re.search(r'before\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))', instruction, re.I)
    if deadline:
        data['kickoffBefore'] = deadline[1]
    data['marketPolicy'] = 'only' if re.search(r'only (?:use|double|draw|over|under|home|away|btts|these markets|my requested markets)|markets? only|strictly|nothing except', text) else 'prefer'
    data['fixtureMode'] = 'original_only' if re.search(r'only (?:the )?original|same matches only|do not add|no new (?:matches|games)', text) else 'upcoming' if re.search(r'replace all|new matches only', text) else 'adaptive'
    data['allowOddsAdjustment'] = bool(re.search(r'nearest|closest|adjust (?:the )?odds|relax (?:the )?odds', text))
    data['preserveOriginalSelections'] = bool(re.search(r'keep (?:all )?(?:my |the )?(?:original )?(?:picks|selections)', text))
    if re.search(r'\bdraws?\b', text) and not re.search(r'no draws?|avoid draws?|draw no bet', text):
        data['markets'] = [*data.get('markets', []), Market.DRAW]
    if re.search(r'draw', text) and re.search(r'min(?:ute)?s?', text):
        data['marketQueries'] = [f'{minute} minute draw' for minute in re.findall(r'\b(5|10|15|20|30)\b', text)]
    probability = re.search(r'(?:probability|chance)\s*(?:at least|above|over|>=)?\s*(\d+(?:\.\d+)?)\s*%', text)
    if probability:
        data['minimumProbability'] = float(probability[1]) / 100
    if 'final request settings' in text:
        settings = text.split('final request settings', 1)[1]
        if 'adaptive generation' in settings:
            data['fixtureMode'] = 'adaptive'
        if 'replace all original matches' in settings:
            data['fixtureMode'] = 'upcoming'
        if 'only use the original matches' in settings:
            data['fixtureMode'] = 'original_only'
        if 'treat my market choices as preferences' in settings:
            data['marketPolicy'] = 'prefer'
        if 'only use my requested markets' in settings:
            data['marketPolicy'] = 'only'
    return apply_default_investor(apply_named_mode(Config.model_validate(data), instruction), instruction)


_intent_cache: dict[tuple, tuple[float, Config]] = {}


def local_fallback_supported(instruction: str) -> bool:
    text = instruction.casefold()
    # Investor Mode drops user odds, markets, and counts, so extra wording is safe to ignore.
    named = [(m.start(), mode) for pattern, mode, *_ in MODES for m in re.finditer(pattern, text, re.I)]
    if named and max(named)[1] == 'INVESTOR':
        return True
    numeric = bool(re.search(r'(?:create|generate|give me)\s+\d+', text) and re.search(r'between\s+\d+(?:\.\d+)?\s*(?:and|to|-|–)\s*\d+', text))
    numeric = numeric or bool(re.search(r'\b(?:split|spilt|splate|divide|partition)\b', text) and re.search(r'\binto\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b', text))
    # Simple mode buttons and count controls remain usable during provider outages.
    # Reject unfamiliar clauses rather than silently dropping their constraints.
    simple_request = False
    if draw_request(instruction) is not None or any(re.search(pattern, text) for pattern, *_ in MODES):
        remaining = text
        for pattern, *_ in MODES:
            remaining = re.sub(pattern, ' ', remaining)
        for pattern in [r'source code:\s*[a-z0-9_]+', r'final request settings\s*\(take precedence\)',
                        r'(?:generate|create|give me)\s+\d+\s+(?:tickets?|codes?|slips?)',
                        r'(?:exactly\s+)?\d+\s+(?:games?|matches?|picks?|legs?|selections?)\s+per\s+(?:ticket|slip|code)',
                        r'between\s+\d+(?:\.\d+)?\s*(?:and|to|-)\s*\d+(?:\.\d+)?(?:\s+odds)?',
                        r'\b\d{1,2}\s*(?:to|[-–])\s*\d{1,2}\b', r'\b\d{1,2}\s*(?:minutes?|mins?)\b']:
            remaining = re.sub(pattern, ' ', remaining)
        benign = set('create generate give me a ticket tickets codes slips use using my selected settings risk mode upcoming games matches are allowed as needed you may with first draws draw minutes minute only requested markets please the in from'.split())
        simple_request = not (set(re.findall(r'[a-z0-9_]+', remaining)) - benign)
    # Do not guess at constraints this deterministic parser cannot understand.
    unsupported = re.search(r'tomorrow|tonight|today|weekend|next week|include|league|before(?!\s+\d{4}-)|after|only|never|without|don.t|\bnot\b|\bno\b|\bexcept\b', text)
    return simple_request or (numeric and not unsupported)


def _parse_intent(instruction: str, available_markets: list[dict] | None = None) -> Config:
    provider = resolve_provider_name()
    if provider in ('openai', 'groq'):
        settings = resolve_settings()
        model = select_model(instruction, available_markets, settings)
        catalog_key = hashlib.sha256(json.dumps(available_markets or [], sort_keys=True).encode()).hexdigest()
        cache_key = (provider, model, settings.route, settings.temperature, settings.base_url, instruction, catalog_key)
        cached = _intent_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < 300:
            return resolve_preferences(cached[1].model_copy(deep=True), available_markets or [], instruction)
        try:
            config = parse_chat_completions(instruction, available_markets, model=model)
        except IntentProviderError as exc:
            reason = str(exc).casefold()
            transient = 'rate limit' in reason or 'could not reach' in reason or bool(re.search(r'http 5\d\d', reason))
            missing_key = 'api_key is required' in reason
            if not local_fallback_supported(instruction) or not (transient or missing_key):
                raise
            config = parse_rules(instruction)
            config.unhandledRequests.append(
                f'{settings.label} has no API key; this request was interpreted by the local parser.'
                if missing_key else
                f'{settings.label} was temporarily unavailable; this request was interpreted by the local parser. Review the settings shown below.'
            )
        if len(_intent_cache) >= 128:
            _intent_cache.pop(next(iter(_intent_cache)))
        _intent_cache[cache_key] = (time.monotonic(), config.model_copy(deep=True))
        return resolve_preferences(config, available_markets or [], instruction)
    # Optional local language model. The response is configuration only; it never invents fixtures.
    if provider == 'ollama':
        schema = Config.model_json_schema()
        response = httpx.post(
            os.getenv('OLLAMA_URL', 'http://host.docker.internal:11434') + '/api/chat',
            json={'model': os.getenv('OLLAMA_MODEL', 'llama3.2'), 'stream': False, 'format': schema,
                  'messages': [{'role': 'system', 'content': f'Convert football slip instructions to configuration. Current UTC time: {datetime.now(timezone.utc).isoformat()}. Return only configuration; do not select fixtures or invent IDs.'},
                               {'role': 'user', 'content': instruction}], 'options': {'temperature': 0}},
            timeout=90,
        )
        response.raise_for_status()
        return resolve_preferences(Config.model_validate(json.loads(response.json()['message']['content'])), available_markets or [], instruction)
    if provider == 'rules':
        return resolve_preferences(parse_rules(instruction), available_markets or [], instruction)
    raise ValueError(f'Unsupported AI_PROVIDER: {provider}')


def parse_intent(instruction: str, available_markets: list[dict] | None = None, learned_defaults: dict | None = None) -> Config:
    explicit_count = validate_ticket_count(instruction)
    config = _parse_intent(instruction, available_markets)
    memory = learned_defaults or {}
    text = instruction.casefold()
    if memory.get('ticketCount') and explicit_count is None and not re.search(r'(?:create|generate|give me)\s+\d+|\d+\s+(?:tickets?|codes?|slips?|parts?|pieces?)|\bsplit\b', text):
        config.numberOfSlips = min(10, max(1, int(memory['ticketCount'])))
    games = extract_games_per_ticket(instruction)
    if games is not None:
        config.minimumSelections = config.maximumSelections = games
    elif re.search(r'games per ticket:\s*random', text):
        if not re.search(r'\b(?:min(?:imum)?|max(?:imum)?)\s+\d+\s*(?:games?|matches?|legs?|selections?)', text):
            config.minimumSelections, config.maximumSelections = 1, 50
    elif memory.get('gamesPerTicket') and not re.search(r'\d+\s+(?:games?|matches?|picks?|legs?|selections?)', text):
        config.minimumSelections = config.maximumSelections = memory['gamesPerTicket']
    low, high = extract_odds_bounds(instruction)
    if low is not None:
        config.minimumOdds = low
    if high is not None:
        config.maximumOdds = high
    if memory.get('riskMode') and not re.search(r'\b(?:mode|modes|risk|odds|between|around|conservative|aggressive|safer|higher|lower|medium|moderate)\b', text):
        label = {'INVESTOR': 'Investor Mode', 'GAMBLER': 'Gambler Mode', 'JAPA': 'Japa Mode', 'LAGOS_LIFE': 'Lagoslife Mode'}[memory['riskMode']]
        config = apply_named_mode(config, label)
    config = apply_named_mode(config, instruction)
    return apply_default_investor(config, instruction)

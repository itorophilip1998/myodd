"""Resolve market preferences against bookmaker-supplied IDs only."""
import re
from .schemas import Config, MarketRule, Market
from .draw_markets import enforce_draw_intent


def normalized(text):
    text = re.sub(r'\b(mins?|minutes?)\b', 'minute', text.casefold())
    text = re.sub(r'\b(gg/ng|btts)\b', 'both teams score', text)
    return re.findall(r'\d+(?:\.\d+)?|[a-z]+', text)


def resolve_preferences(config: Config, catalog: list[dict], instruction: str = "") -> Config:
    config.relatedMarketRules = []  # Alternatives are derived locally, never trusted from a model.
    by_key = {(str(m['marketId']), m.get('specifier', '')): m for m in catalog}
    valid_rules = []
    for rule in config.marketRules:
        matches = [market for (market_id, specifier), market in by_key.items()
                   if market_id == rule.marketId and (rule.specifier is None or rule.specifier == specifier)]
        for market in matches:
            allowed = {str(o['outcomeId']) for o in market.get('outcomes', [])}
            ids = [outcome for outcome in rule.outcomeIds if outcome in allowed]
            if rule.outcomeIds and not ids:
                continue
            valid_rules.append(MarketRule(marketId=rule.marketId, specifier=market.get('specifier', ''), outcomeIds=ids))
    if config.marketRules and not valid_rules:
        config.unhandledRequests.append('Requested market IDs were not present in the bookmaker catalog; invented IDs were discarded.')
        if not config.marketQueries:
            config.marketQueries = ['Unresolved requested market']
    if not valid_rules and config.marketQueries:
        stop = {'the', 'first', 'a', 'of', 'and', 'to', 'market', 'markets', 'only', 'prefer'}
        for market in catalog:
            matching = []
            for outcome in market.get('outcomes', []):
                available = set(normalized(f'{market["marketName"]} {market.get("specifier", "")} {outcome["outcomeName"]}'))
                for query in config.marketQueries:
                    tokens = set(normalized(query)) - stop
                    if tokens and tokens <= available:
                        matching.append(str(outcome['outcomeId']))
            if matching:
                valid_rules.append(MarketRule(marketId=str(market['marketId']), specifier=market.get('specifier', ''), outcomeIds=list(dict.fromkeys(matching))))
    text = instruction.casefold()
    if 'double chance' in text and not re.search(r'combined|combination market|double chance\s*&', text):
        # A plain double-chance preference must not silently become an expensive compound market.
        compound_ids = {str(m['marketId']) for m in catalog
                        if 'double chance' in m['marketName'].casefold() and m['marketName'].casefold().strip() != 'double chance'}
        valid_rules = [rule for rule in valid_rules if rule.marketId not in compound_ids]
        config.markets = list(dict.fromkeys(config.markets + [Market.DOUBLE_CHANCE_1X, Market.DOUBLE_CHANCE_X2, Market.DOUBLE_CHANCE_12]))
    if 'draw' in text:
        requested_minutes = set(re.findall(r'\b(5|10|15|20|30)\s*min', text))
        for minute in sorted(requested_minutes, key=int):
            found = []
            for market in catalog:
                if not re.search(r'min', market['marketName'], re.I):
                    continue
                label = market['marketName'] + ' ' + market.get('specifier', '')
                if not re.search(rf'\b{minute}\b', label):
                    continue
                draw_ids = [str(o['outcomeId']) for o in market.get('outcomes', []) if o['outcomeName'].casefold().strip() in ('draw', 'x')]
                if draw_ids:
                    found.append(MarketRule(marketId=str(market['marketId']), specifier=market.get('specifier', ''), outcomeIds=draw_ids))
            if found:
                valid_rules += found
            else:
                config.unhandledRequests.append(f'No available {minute}-minute draw market was found in the inspected catalog.')
    unique = {(rule.marketId, rule.specifier, tuple(rule.outcomeIds)): rule for rule in valid_rules}
    config.marketRules = list(unique.values())
    if (config.markets or config.marketRules or config.marketQueries) and not re.search(r'any markets?|unrelated markets?|ignore (?:the )?market', instruction, re.I):
        config.marketPolicy = 'only'
    return enforce_draw_intent(config, catalog, instruction)

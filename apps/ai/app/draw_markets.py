"""Conservative draw-market matching using real labels, periods and outcome IDs."""
import re
from .schemas import MarketRule


def period(label):
    text = label.casefold().replace('–', '-').replace('—', '-')
    interval = re.search(r'\b(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\b', text)
    if interval:
        start, end = map(int, interval.groups())
        if 0 <= start < end <= 90:
            return ('minutes', max(1, start), end)
    minute = re.search(r'\b(\d{1,2})\s*(?:minutes?|mins?)\b', text)
    if minute:
        end = int(minute[1])
        if 1 <= end <= 90:
            return ('minutes', 1, end)
    if re.search(r'\b(?:1st|first)\s*half\b|\bhalf[- ]time\b', text):
        return ('half', 1)
    if re.search(r'\b(?:2nd|second)\s*half\b', text):
        return ('half', 2)
    return ('full',)


def draw_request(instruction):
    text = instruction.casefold()
    if not re.search(r'\bdraws?\b', text) or re.search(r'\b(?:no|avoid|exclude|without)\s+draws?\b|draw no bet', text):
        return None
    # An explicit union is handled by the normal market resolver, not a draw-only guard.
    if re.search(r'\b(?:or|and|also)\s+(?:double chance|over\b|under\b|btts|home win|away win)', text):
        return None
    # Ignore odds/count settings when identifying the requested football period.
    text = re.sub(r'between\s+\d+(?:\.\d+)?\s*(?:and|to|-)\s*\d+(?:\.\d+)?\s*odds', '', text)
    text = re.sub(r'\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?\s*odds', '', text)
    return period(text)


def draw_rules(catalog, requested, alternatives=True):
    exact, related = [], []
    for market in catalog:
        name = market['marketName'].casefold()
        # These settle on a different object or condition even if their labels contain Draw.
        if re.search(r'corners?|cards?|goal kicks?|throw|offside|penalt|handicap|double chance|draw no bet|&|\band\b', name):
            continue
        if period(name) != requested:
            continue
        # Full-match matching must not accidentally accept an unfamiliar time/period market.
        if requested == ('full',) and re.search(r'half|period|minute|\b1up\b|\b2up\b|extra|overtime', name):
            continue
        exact_ids, related_ids = [], []
        for outcome in market.get('outcomes', []):
            label = outcome['outcomeName'].casefold().strip()
            if re.search(r'1x2|match result|full.?time result|three.?way result', name) and label in ('draw', 'x', 'tie'):
                exact_ids.append(str(outcome['outcomeId']))
            elif alternatives:
                # Equal exact scores imply a draw, but are narrower bets; report their use.
                score = re.fullmatch(r'(\d+)\s*[:-]\s*(\d+)', label)
                if re.search(r'correct score|exact score', name) and score and score[1] == score[2]:
                    related_ids.append(str(outcome['outcomeId']))
                # Under 0.5 total goals implies 0-0. Team-specific totals do not.
                elif re.search(r'over.?under|total goals', name) and not re.search(r'home|away|team', name):
                    if re.fullmatch(r'under\s*0[.,]5', label) or (label == 'under' and re.search(r'(?:total|goals|line)=0[.,]5\b', market.get('specifier', ''))):
                        related_ids.append(str(outcome['outcomeId']))
        for target, ids in [(exact, exact_ids), (related, related_ids)]:
            if ids:
                target.append(MarketRule(marketId=str(market['marketId']), specifier=market.get('specifier', ''), outcomeIds=ids))
    return exact, related


def enforce_draw_intent(config, catalog, instruction):
    requested = draw_request(instruction)
    if requested is None:
        return config
    strict = bool(re.search(r'no alternatives|exact market only|only (?:use )?(?:the )?(?:1x2|requested markets)', instruction, re.I))
    exact, related = draw_rules(catalog, requested, alternatives=not strict)
    if not config.riskMode and not re.search(r'\bodds\b|\baround\s+\d', instruction, re.I):
        # A minute interval is not an odds target. Do not impose an unrequested 2.5-5 band.
        from .odds_policy import MIN_SELECTION_ODDS
        config.minimumOdds, config.maximumOdds = MIN_SELECTION_ODDS, None
    config.markets = []  # A generic DRAW enum must not admit a different period.
    config.marketRules = exact
    config.relatedMarketRules = related
    config.marketPolicy = 'only'
    config.marketQueries = ['draw in minutes %s-%s' % requested[1:] if requested[0] == 'minutes' else f'{requested} draw']
    config.unhandledRequests = [notice for notice in config.unhandledRequests if not notice.startswith('No exact ')]
    if not exact:
        label = f'{requested[1]}–{requested[2]} minute' if requested[0] == 'minutes' else 'requested-period'
        config.unhandledRequests.append(f'No exact {label} draw market was found in the inspected catalog; looking for more fixtures or draw-preserving alternatives for the same period.')
    return config

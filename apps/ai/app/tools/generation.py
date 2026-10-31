"""Build the generation report and apply expansion/fallback stages."""
from app.schemas import Config, ScoredSelection, Selection
from .selections import eligible, matches_preference, matches_related
from .search import mode_plan, target_odds_window, search, search_system_plan, uses_system_plan


def generate_report(pool: list[ScoredSelection], config: Config, original: list[Selection], expansion_attempted=False):
    notices = list(config.unhandledRequests)
    original_ids = {s.eventId for s in original}
    filtered = [s for s in pool if eligible(s, config)]
    if config.fixtureMode == 'original_only' and original:
        filtered = [s for s in filtered if s.eventId in original_ids]
    elif config.fixtureMode == 'upcoming':
        filtered = [s for s in filtered if s.eventId not in original_ids]
    original_pool = [s for s in filtered if s.eventId in original_ids]
    available_original = len({s.eventId for s in original_pool})
    if original_ids and available_original < len(original_ids):
        notices.append(f'{available_original} of {len(original_ids)} original matches have eligible pre-match markets; unavailable matches were skipped.')
    preserve_blocked = False
    if config.preserveOriginalSelections and original:
        eligible_keys = {(s.eventId, s.marketId, s.outcomeId, s.specifier) for s in filtered}
        if not all((s.eventId, s.marketId, s.outcomeId, s.specifier) in eligible_keys for s in original):
            notices.append('Some original picks are unavailable or conflict with your hard filters; the keep-picks instruction was preserved.')
            filtered = []
            original_pool = []
            preserve_blocked = True
    preferences = bool(config.markets or config.marketRules or config.marketQueries)
    preferred = [s for s in filtered if matches_preference(s, config)]
    has_expansion = any(s.eventId not in original_ids for s in pool)
    # Search the exact requested market across fixtures before considering related alternatives.
    exact_stages = []
    if original and config.fixtureMode != 'upcoming':
        exact_stages.append([s for s in original_pool if matches_preference(s, config)] if preferences else original_pool)
    if config.fixtureMode != 'original_only' or not original:
        exact_stages.append(preferred if preferences else filtered)
    candidates, bounds = [], None
    if uses_system_plan(config):
        stage = preferred if preferences else filtered
        candidates, bounds = search_system_plan(stage, config, original)
        exact_stages = []
    for stage in exact_stages:
        current, possible = search(stage, config, original)
        if possible:
            bounds = possible
        if len(current) >= len(candidates):
            candidates = current
        if len(candidates) >= config.numberOfSlips:
            break
    needs_expansion = (len(candidates) < config.numberOfSlips and config.fixtureMode == 'adaptive'
                       and bool(original) and not has_expansion and not expansion_attempted and not preserve_blocked)
    if not needs_expansion and not candidates and not uses_system_plan(config):
        # Hard filtering already limits this pool to exact or locally verified related rules.
        fallback_stages = [original_pool] if original and config.fixtureMode != 'upcoming' else []
        if config.fixtureMode != 'original_only' or not original:
            fallback_stages.append(filtered)
        for stage in fallback_stages:
            current, possible = search(stage, config, original)
            if possible:
                bounds = possible
            if len(current) >= len(candidates):
                candidates = current
            if len(candidates) >= config.numberOfSlips:
                break
    if config.allowOddsAdjustment and not needs_expansion and len(candidates) < config.numberOfSlips:
        candidates, bounds = search(filtered, config, original, allow_nearest=True)
    used_market_fallback = any(not matches_preference(ScoredSelection.model_validate(s), config) for c in candidates for s in c['selections'])
    used_related = sum(matches_related(ScoredSelection.model_validate(s), config) for c in candidates for s in c['selections'])
    if used_related:
        notices.append(f'Used {used_related} draw-preserving alternatives for the same requested period: equal-score or no-goal selections. These are narrower bets, not the exact 1X2 Draw market.')
    if preferences and not preferred:
        notices.append('Requested markets or outcomes are not available in this fixture pool.'
                       + (' Only matching or draw-preserving alternatives for the same period were considered.' if config.relatedMarketRules else ' The market restriction was kept.' if config.marketPolicy == 'only' else ' Other available markets were considered.'))
    elif used_market_fallback and not used_related:
        notices.append('Other markets were used where preferred markets could not produce enough combinations.')
    expanded_events = {s['eventId'] for c in candidates for s in c['selections']} - original_ids
    if original_ids and expanded_events:
        notices.append(f'Added {len(expanded_events)} upcoming matches to reach the requested odds or variety.')
    if any(s['modelVersion'] == 'odds-raw-v1' for c in candidates for s in c['selections']):
        notices.append('Specialty markets were ranked using bookmaker-implied estimates.')
    if any(s['modelVersion'] == 'odds-interval-v1' for c in candidates for s in c['selections']):
        notices.append('Interval results use margin-adjusted bookmaker probabilities, not a trained guarantee of match outcomes.')
    adjusted = any(c['totalOdds'] < config.minimumOdds or (config.maximumOdds is not None and c['totalOdds'] > config.maximumOdds) for c in candidates)
    effective = config.model_copy(deep=True)
    if adjusted:
        effective.minimumOdds = min(config.minimumOdds, *(c['totalOdds'] for c in candidates))
        effective.maximumOdds = max(config.maximumOdds, *(c['totalOdds'] for c in candidates)) if config.maximumOdds is not None else None
        notices.append(f'Used your nearest-odds option: returned totals span {min(c["totalOdds"] for c in candidates):g}–{max(c["totalOdds"] for c in candidates):g}.')
    if uses_system_plan(config) and len(candidates) < config.numberOfSlips:
        grouped = []
        for target, count in mode_plan(config):
            low, high = target_odds_window(target, config)
            got = sum(1 for c in candidates if low <= c['totalOdds'] <= high)
            grouped.append(f'{got} of {count} at {target:g}')
        notices.append(f'{config.riskMode.title()} mixed-odds plan (' + ', '.join(grouped) + '). Missing targets could not be filled within the available markets and search budget; no out-of-band tickets were added.')
    if len(candidates) < config.numberOfSlips:
        notices.append(f'Found {len(candidates)} of {config.numberOfSlips} requested unique combinations within the search budget.')
    if not candidates and bounds:
        notices.append(f'The eligible pool has theoretical odds bounds of {bounds["minimum"]:g}–{bounds["maximum"]:g} under your selection limits; intermediate totals are not guaranteed.')
    for candidate in candidates:
        for field in ('_rank', '_preferred', '_original', '_distance'):
            candidate.pop(field, None)
    return {'candidates': candidates, 'notices': list(dict.fromkeys(notices)), 'needsExpansion': needs_expansion,
            'effectiveConfig': effective.model_dump(mode='json'),
            'diagnostics': {'requestedSlips': config.numberOfSlips, 'foundSlips': len(candidates),
                            'eligibleEvents': len({s.eventId for s in filtered}), 'preferredSelections': len(preferred),
                            'selectionPool': len(filtered), 'oddsBounds': bounds}}


def generate(pool, config, original):
    return generate_report(pool, config, original)['candidates']

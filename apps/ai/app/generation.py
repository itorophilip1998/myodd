"""Adaptive search with explicit hard constraints and soft market/risk preferences."""
import hashlib
import math
import random
from datetime import datetime, timezone

from .odds_policy import within_mode_selection_odds
from .schemas import Config, ScoredSelection, Selection


def fingerprint(selections):
    return hashlib.sha256('\n'.join(sorted(f'{s.eventId}|{s.marketId}|{s.outcomeId}|{s.specifier}' for s in selections)).encode()).hexdigest()


def selection_key(selection):
    """Identity of one pick. The same game may recur only with a different key."""
    if isinstance(selection, dict):
        return (selection['eventId'], selection['marketId'], selection['outcomeId'], selection.get('specifier') or '')
    return (selection.eventId, selection.marketId, selection.outcomeId, selection.specifier or '')


def match_key(selection):
    """Normalize a fixture so the same game cannot appear twice under different event IDs."""
    home = ' '.join((selection.homeTeam or '').casefold().split())
    away = ' '.join((selection.awayTeam or '').casefold().split())
    return '|'.join(sorted((home, away)))


def unique_ticket(selections):
    event_ids = [s.eventId for s in selections]
    matches = [match_key(s) for s in selections]
    return len(event_ids) == len(set(event_ids)) == len(selections) and len(matches) == len(set(matches))


def matches_preference(selection, config):
    if config.marketRules:
        return selection.supportedMarket in config.markets or any(selection.marketId == rule.marketId
                   and (rule.specifier is None or selection.specifier == rule.specifier)
                   and (not rule.outcomeIds or selection.outcomeId in rule.outcomeIds)
                   for rule in config.marketRules)
    return selection.supportedMarket in config.markets if config.markets else not config.marketQueries


def matches_related(selection, config):
    return any(selection.marketId == rule.marketId
               and (rule.specifier is None or selection.specifier == rule.specifier)
               and (not rule.outcomeIds or selection.outcomeId in rule.outcomeIds)
               for rule in config.relatedMarketRules)


def eligible(selection, config):
    teams = f'{selection.homeTeam} {selection.awayTeam}'.casefold()
    league = selection.league.casefold()
    now = datetime.now(timezone.utc)
    return (selection.isActive and selection.kickoffAt > now
            and within_mode_selection_odds(selection.odds, config.riskMode)
            and not any(t.casefold() in teams for t in config.excludedTeams)
            and not any(t.casefold() in league for t in config.excludedLeagues)
            and (not config.includedLeagues or any(t.casefold() in league for t in config.includedLeagues))
            and (not config.kickoffBefore or selection.kickoffAt <= config.kickoffBefore)
            and (not config.kickoffAfter or selection.kickoffAt >= config.kickoffAfter)
            and (config.minimumProbability is None or selection.probability >= config.minimumProbability)
            and (config.marketPolicy != 'only' or matches_preference(selection, config) or matches_related(selection, config)))


def event_choices(pool, config):
    # Collapse duplicate listings of the same match (different event IDs) to one game.
    by_match: dict[str, list] = {}
    for selection in pool:
        by_match.setdefault(match_key(selection), []).append(selection)
    deduped = []
    for group in by_match.values():
        best_event = max(group, key=lambda s: (s.probability, -s.odds)).eventId
        deduped.extend(s for s in group if s.eventId == best_event)
    events = {}
    for selection in deduped:
        events.setdefault(selection.eventId, []).append(selection)
    # Preserve market diversity, rather than letting near-identical favourites fill every slot.
    for event, choices in events.items():
        ranked = sorted(choices, key=lambda s: (matches_preference(s, config), s.probability), reverse=True)
        by_market = {}
        for s in ranked:
            by_market.setdefault((s.marketId, s.specifier), []).append(s)
        diverse = []
        for round_index in range(3):
            for group in by_market.values():
                if round_index < len(group):
                    diverse.append(group[round_index])
        # Retain long shots too, for large target odds; a probability floor is never inferred from risk.
        favourites = [s for s in ranked if matches_preference(s, config)][:20]
        events[event] = list({(s.marketId, s.outcomeId, s.specifier): s for s in favourites + diverse[:36] + ranked[-4:]}.values())
    return events


def varied_candidates(candidates, config, rng, limit, ceiling, repeatable=()):
    """Spread tickets across randomized targets; rank quality within each target.

    A pick (event, market, outcome, line) is used on at most one ticket.
    `repeatable` keys, such as pinned original selections, may appear again.
    """
    remaining = list(candidates)
    count = min(limit, len(remaining))
    if not count:
        return []
    repeatable = set(repeatable)
    low, high = math.log(config.minimumOdds), math.log(max(config.minimumOdds, ceiling))
    targets = [low + (index + rng.random()) / count * (high - low) for index in range(count)]
    rng.shuffle(targets)
    picked = []
    used_keys, used_events = set(), set()
    def fresh(candidate):
        return {selection_key(s) for s in candidate['selections']} - repeatable
    for target in targets:
        compatible = [candidate for candidate in remaining if not (fresh(candidate) & used_keys)]
        if not compatible:
            break
        candidate = max(compatible, key=lambda c: (
            -len({s['eventId'] for s in c['selections']} & used_events), c['_preferred'],
            -abs(math.log(c['totalOdds']) - target), c['_original'], c['_rank']))
        picked.append(candidate)
        used_keys.update(fresh(candidate))
        used_events.update(s['eventId'] for s in candidate['selections'])
        remaining.remove(candidate)
    return picked


def search(pool, config, original, allow_nearest=False, rng=None):
    events = event_choices(pool, config)
    if len(events) < config.minimumSelections:
        return [], None
    original_ids = {s.eventId for s in original}
    original_keys = {(s.eventId, s.marketId, s.outcomeId, s.specifier) for s in original}
    if config.preserveOriginalSelections:
        for event in original_ids:
            events[event] = [s for s in pool if (s.eventId, s.marketId, s.outcomeId, s.specifier) in original_keys and s.eventId == event]
        if any(not events[event] for event in original_ids) or len(original_keys) != len(original_ids):
            return [], None
    original_fingerprint = fingerprint(original) if original else None
    rng = rng or random.Random()
    maximum = min(config.maximumSelections, len(events))
    minimum = max(config.minimumSelections, len(original_ids)) if config.preserveOriginalSelections else config.minimumSelections
    if minimum > maximum:
        return [], None
    event_ids = sorted(events)
    results = {}
    nearest = {}
    max_event_odds = sorted((max(s.odds for s in options) for options in events.values()), reverse=True)
    upper_bound = math.prod(max_event_odds[:maximum])
    min_event_odds = sorted(min(s.odds for s in options) for options in events.values())
    lower_bound = math.prod(min_event_odds[:config.minimumSelections])
    ceiling = config.maximumOdds if config.maximumOdds is not None else max(config.minimumOdds, min(upper_bound, 1e300))
    # Investor / VERY_LOW maximizes estimated joint probability within the hard odds band.
    exponent, appetite, penalty = {
        'VERY_LOW': (4.5, 0, .85), 'LOWER': (2, 0, .15), 'MODERATE': (1, .4, 0),
        'HIGHER': (.7, 1.15, -.05), 'VERY_HIGH': (.35, 1.6, -.15),
    }[config.riskPreference]
    weights = {event: [max(.001, s.probability) ** exponent
                       * (5 if matches_preference(s, config) else 1) for s in options]
               for event, options in events.items()}
    if upper_bound < config.minimumOdds and not allow_nearest:
        return [], {'minimum': round(lower_bound, 2), 'maximum': round(min(upper_bound, 1e12), 2)}
    attempts = min(12000, max(900, config.numberOfSlips * 100))
    for attempt in range(attempts):
        # Vary lengths and targets while keeping explicitly fixed counts/ranges intact.
        legs = rng.randint(minimum, maximum)
        target_log = rng.uniform(math.log(config.minimumOdds), math.log(max(config.minimumOdds, ceiling)))
        chosen = (sorted(original_ids) + rng.sample([event for event in event_ids if event not in original_ids], legs - len(original_ids))
                  if config.preserveOriginalSelections else rng.sample(event_ids, legs))
        if original_ids and attempt % 3 != 0:
            chosen.sort(key=lambda event: event not in original_ids)
        picked = []
        log_odds = 0.0
        for index, event in enumerate(chosen):
            choices = events[event]
            if config.preserveOriginalSelections and event in original_ids:
                choices = [s for s in choices if (s.eventId, s.marketId, s.outcomeId, s.specifier) in original_keys]
                if not choices:
                    break
            remaining = legs - index
            if attempt % 4 in (1, 2):
                target = (target_log - log_odds) / remaining
                ordering = sorted(choices, key=lambda s: abs(math.log(s.odds) - target)
                                  + (0 if matches_preference(s, config) else .12))[:min(6, len(choices))]
                selection = rng.choice(ordering)
            elif choices is events[event]:
                selection = rng.choices(choices, weights=weights[event])[0]
            else:
                selection = rng.choice(choices)
            picked.append(selection)
            log_odds += math.log(selection.odds)
        if len(picked) != legs or not unique_ticket(picked):
            continue
        if not all(any(team.casefold() in f'{s.homeTeam} {s.awayTeam}'.casefold() for s in picked) for team in config.includedTeams):
            continue
        if config.preserveOriginalSelections and not original_keys.issubset({(s.eventId, s.marketId, s.outcomeId, s.specifier) for s in picked}):
            continue
        key = fingerprint(picked)
        if key == original_fingerprint:
            continue
        odds = math.prod(s.odds for s in picked)
        joint_log = sum(math.log(max(.000001, s.probability)) for s in picked)
        volatility = sum(math.log(s.odds) ** 2 for s in picked) / legs
        preference_count = sum(matches_preference(s, config) for s in picked)
        original_count = sum(s.eventId in original_ids for s in picked)
        ranking = joint_log + appetite * math.log(odds) - penalty * volatility
        candidate = {'selections': [s.model_dump(mode='json') for s in picked],
                     'totalOdds': round(odds, 2), 'slipScore': round(math.exp(joint_log) * 100, 8),
                     'fingerprint': key, '_rank': ranking, '_preferred': preference_count / legs,
                     '_original': original_count / legs}
        if math.isfinite(odds) and config.minimumOdds <= round(odds, 2) and (config.maximumOdds is None or round(odds, 2) <= config.maximumOdds):
            results[key] = candidate
            if len(results) > max(100, config.numberOfSlips * 12):
                retained = varied_candidates(results.values(), config, rng, max(50, config.numberOfSlips * 6), ceiling,
                                             original_keys if config.preserveOriginalSelections else ())
                results = {c['fingerprint']: c for c in retained}
        elif allow_nearest:
            candidate['_distance'] = max(math.log(config.minimumOdds / odds), math.log(odds / config.maximumOdds) if config.maximumOdds is not None else 0, 0)
            if len(nearest) < config.numberOfSlips * 4 or candidate['_distance'] < max(s['_distance'] for s in nearest.values()):
                nearest[key] = candidate
                if len(nearest) > config.numberOfSlips * 4:
                    del nearest[max(nearest, key=lambda k: nearest[k]['_distance'])]
    repeatable = original_keys if config.preserveOriginalSelections else ()
    ranked = varied_candidates(results.values(), config, rng, config.numberOfSlips, ceiling, repeatable)
    if allow_nearest and len(ranked) < config.numberOfSlips:
        repeatable_keys = set(repeatable)
        used = set()
        for ticket in ranked:
            used.update({selection_key(s) for s in ticket['selections']} - repeatable_keys)
        for candidate in sorted(nearest.values(), key=lambda c: (c['_distance'], -c['_rank'])):
            fresh = {selection_key(s) for s in candidate['selections']} - repeatable_keys
            if fresh & used:
                continue
            ranked.append(candidate)
            used.update(fresh)
            if len(ranked) >= config.numberOfSlips:
                break
    ranked.sort(key=lambda c: (c['_preferred'], c['_original'], c['_rank']), reverse=True)
    return ranked[:config.numberOfSlips], {'minimum': round(lower_bound, 2), 'maximum': round(min(upper_bound, 1e12), 2)}


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
    if not needs_expansion and not candidates:
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

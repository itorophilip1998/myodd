"""Bounded ticket combination search, diversity ranking and Investor allocation."""
import math
import random

from .selections import event_choices, fingerprint, match_key, matches_preference, selection_key, unique_ticket


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


INVESTOR_PLAN = ((3.0, 3), (4.0, 3), (5.0, 2), (6.0, 2))
GAMBLER_PLAN = tuple((round(6.1 + i * (20 - 6.1) / 9, 2), 1) for i in range(10))
SYSTEM_ODDS_SPAN = 0.10


def uses_system_plan(config) -> bool:
    """Internal system plans cover the complete selected mode band."""
    return (config.riskMode in ('INVESTOR', 'GAMBLER') and config.fixtureMode != 'original_only'
            and not config.preserveOriginalSelections and config.numberOfSlips == 10
            and (config.minimumOdds, config.maximumOdds) == ((3, 6) if config.riskMode == 'INVESTOR' else (6.1, 20)))


def mode_plan(config):
    return INVESTOR_PLAN if config.riskMode == 'INVESTOR' else GAMBLER_PLAN


def target_odds_window(target: float, config=None) -> tuple[float, float]:
    minimum, maximum = (config.minimumOdds, config.maximumOdds) if config else (3., 6.)
    return max(minimum, target - SYSTEM_ODDS_SPAN), min(maximum, target + SYSTEM_ODDS_SPAN)


def target_leg_bounds(pool, low: float, high: float) -> tuple[int, int]:
    prices = [s.odds for s in pool if s.odds > 1]
    if not prices:
        return 1, 50
    cheapest, dearest = min(prices), max(prices)
    minimum = 1
    while dearest ** minimum < low and minimum < 20:
        minimum += 1
    maximum = minimum
    while cheapest ** (maximum + 1) <= high and maximum < 20:
        maximum += 1
    return minimum, maximum


def search_system_plan(pool, config, original, rng=None):
    rng = rng or random.Random()
    blocked = set()
    found = []
    bounds = None
    for target, count in mode_plan(config):
        low, high = target_odds_window(target, config)
        least, most = target_leg_bounds(pool, low, high)
        scoped = config.model_copy(update={
            'numberOfSlips': count, 'minimumOdds': low, 'maximumOdds': high,
            'minimumSelections': least, 'maximumSelections': most,
        })
        tickets, possible = search(pool, scoped, original, rng=rng, blocked=blocked, steer=True, attempt_limit=12000)
        if possible:
            bounds = possible
        found.extend(tickets)
        for ticket in tickets:
            blocked.update(selection_key(s) for s in ticket['selections'])
    return found, bounds


def search(pool, config, original, allow_nearest=False, rng=None, blocked=(), steer=False, attempt_limit=None):
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
    blocked = set(blocked)
    event_ids = [event for event in sorted(events) if any(selection_key(s) not in blocked for s in events[event])]
    maximum = min(maximum, len(event_ids))
    if minimum > maximum:
        return [], None
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
    attempts = attempt_limit if attempt_limit is not None else min(12000, max(900, config.numberOfSlips * 100))
    center = math.sqrt(config.minimumOdds * max(config.minimumOdds, ceiling))
    for attempt in range(attempts):
        # Vary lengths and targets while keeping explicitly fixed counts/ranges intact.
        legs = rng.randint(minimum, maximum)
        target_log = math.log(center) if steer else rng.uniform(math.log(config.minimumOdds), math.log(max(config.minimumOdds, ceiling)))
        chosen = (sorted(original_ids) + rng.sample([event for event in event_ids if event not in original_ids], legs - len(original_ids))
                  if config.preserveOriginalSelections else rng.sample(event_ids, legs))
        if original_ids and attempt % 3 != 0:
            chosen.sort(key=lambda event: event not in original_ids)
        picked = []
        log_odds = 0.0
        for index, event in enumerate(chosen):
            choices = events[event]
            if blocked:
                choices = [s for s in choices if selection_key(s) not in blocked]
            if not choices:
                break
            if config.preserveOriginalSelections and event in original_ids:
                choices = [s for s in choices if (s.eventId, s.marketId, s.outcomeId, s.specifier) in original_keys]
                if not choices:
                    break
            remaining = legs - index
            if steer or attempt % 4 in (1, 2):
                target = (target_log - log_odds) / remaining
                ordering = sorted(choices, key=lambda s: abs(math.log(s.odds) - target)
                                  + (0 if matches_preference(s, config) else .12))[:min(6, len(choices))]
                selection = ordering[0] if steer and attempt % 3 != 0 else rng.choice(ordering)
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



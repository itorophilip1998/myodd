"""Bounded ticket combination search, diversity ranking and Investor allocation."""
import math
import random
import re

from .selections import event_choices, fingerprint, match_key, matches_preference, selection_key, unique_ticket


def varied_candidates(candidates, config, rng, limit, ceiling, repeatable=(), unique_matches=False):
    """Spread tickets across randomized targets; rank quality within each target.

    A pick (event, market, outcome, line) is used on at most one ticket.
    `repeatable` keys, such as pinned original selections, may appear again.
    When `unique_matches` is set, the same fixture (home/away) cannot appear on two tickets.
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
    used_keys, used_events, used_matches = set(), set(), set()
    def fresh(candidate):
        return {selection_key(s) for s in candidate['selections']} - repeatable
    def ticket_matches(candidate):
        return {match_key(s) for s in candidate['selections']}
    for target in targets:
        compatible = [candidate for candidate in remaining if not (fresh(candidate) & used_keys)]
        if unique_matches:
            compatible = [candidate for candidate in compatible if not (ticket_matches(candidate) & used_matches)]
        if not compatible:
            break
        candidate = max(compatible, key=lambda c: (
            -len({s['eventId'] for s in c['selections']} & used_events), c['_preferred'],
            -abs(math.log(c['totalOdds']) - target), c['_original'], c['_rank']))
        picked.append(candidate)
        used_keys.update(fresh(candidate))
        used_events.update(s['eventId'] for s in candidate['selections'])
        used_matches.update(ticket_matches(candidate))
        remaining.remove(candidate)
    return picked


INVESTOR_PLAN = ((3.0, 3), (4.0, 3), (5.0, 2), (6.0, 2))
STATSMAN_PLAN = INVESTOR_PLAN
# Week-range Over 1.5 Machine: fill across 4–6 (no near-2 shortfall band).
OVER15_PLAN = ((4.0, 4), (5.0, 4), (6.0, 2))
# Goals Desk: O1.5 lane (O1.5 + Asian O2) at 3–5; O2.5 lane at 4–6. Never mix the two lanes.
GOALS_DESK_PLAN = ((3.0, 4), (4.0, 4), (5.0, 2))  # notice fallback only; search uses lane bands
# GGSP notice fallback only — search uses the full 3–4 band (see search_ggsp_plan).
GGSP_PLAN = ((3.0, 4), (3.5, 3), (4.0, 3))
GAMBLER_PLAN = tuple((round(6.1 + i * (20 - 6.1) / 9, 2), 1) for i in range(10))
SYSTEM_ODDS_SPAN = 0.10
OVER15_ODDS = (4.0, 6.0)
GOALS_DESK_ODDS = (3.0, 6.0)
GGSP_ODDS = (3.0, 4.0)


def uses_system_plan(config) -> bool:
    """Internal system plans cover the complete selected mode band."""
    if config.fixtureMode == 'original_only' or config.preserveOriginalSelections:
        return False
    if config.numberOfSlips != 10:
        return False
    if config.riskMode == 'OVER15_MACHINE':
        return (config.minimumOdds, config.maximumOdds) == OVER15_ODDS
    if config.riskMode == 'GOALS_DESK_V2':
        return (config.minimumOdds, config.maximumOdds) == GOALS_DESK_ODDS
    if config.riskMode == 'GGSP_V11':
        return (config.minimumOdds, config.maximumOdds) == GGSP_ODDS
    if config.riskMode in ('INVESTOR', 'STATSMAN'):
        return (config.minimumOdds, config.maximumOdds) == (3, 6)
    if config.riskMode == 'GAMBLER':
        return (config.minimumOdds, config.maximumOdds) == (6.1, 20)
    return False


def mode_plan(config):
    if config.riskMode == 'GAMBLER':
        return GAMBLER_PLAN
    if config.riskMode == 'OVER15_MACHINE':
        return OVER15_PLAN
    if config.riskMode == 'GOALS_DESK_V2':
        return GOALS_DESK_PLAN
    if config.riskMode == 'GGSP_V11':
        return GGSP_PLAN
    return STATSMAN_PLAN if config.riskMode == 'STATSMAN' else INVESTOR_PLAN


def _unique_matches_for(config) -> bool:
    """Over 1.5 Machine / GGSP never reuse the same fixture across tickets in one generation."""
    return config.riskMode in ('OVER15_MACHINE', 'GGSP_V11')


def _goals_total_line(selection) -> float | None:
    specifier = getattr(selection, 'specifier', None) or (selection.get('specifier') if isinstance(selection, dict) else '') or ''
    name = getattr(selection, 'selectionName', None) or (selection.get('selectionName') if isinstance(selection, dict) else '') or ''
    for part in specifier.split('|'):
        if part.startswith('total='):
            try:
                return float(part.split('=', 1)[1])
            except ValueError:
                return None
    match = re.search(r'(\d+(?:\.\d+)?)', name)
    return float(match.group(1)) if match else None


def _goals_desk_lane_pool(pool, line: float):
    return [s for s in pool if (got := _goals_total_line(s)) is not None and abs(got - line) < 1e-6]


def _unique_event_product(pool) -> float:
    """Max combined odds using one pick per event (the priced leg already chosen)."""
    by_event: dict[str, float] = {}
    for selection in pool:
        by_event[selection.eventId] = max(by_event.get(selection.eventId, 0.0), float(selection.odds))
    if not by_event:
        return 0.0
    product = 1.0
    for odds in by_event.values():
        product *= odds
    return product


def _goals_desk_lane_band(lane_pool, nominal_low: float, nominal_high: float) -> tuple[float, float, str | None]:
    """Keep nominal 3–5 / 4–6 when the slate can fill it; otherwise drop the floor to the pool product.

    Short O1.5 legs (~1.15–1.25) need 5–6 uniques to clear 3.0. A thin desk day often only
    clears 3–4 SportyBet legs after Flashscore + pace gates — without this, search returns 0.
    """
    product = _unique_event_product(lane_pool)
    if product <= 1.0:
        return nominal_low, nominal_high, None
    if product + 1e-9 >= nominal_low:
        return nominal_low, nominal_high, None
    # Soft floor must stay ≤ pool product (max(1.5, …) used to block ultra-thin 1.1–1.4 products).
    soft_low = max(1.1, round(product * 0.98, 2))
    soft_high = max(nominal_high, round(product * 1.02, 2))
    note = (
        f'Goals Desk lane soft-floor {soft_low:g}–{soft_high:g} '
        f'(pool product {product:.2f} < nominal {nominal_low:g}).'
    )
    return soft_low, soft_high, note


def search_goals_desk_plan(pool, config, original, rng=None):
    """O1.5 lane (Over 1.5 + Asian Over 2) at 3–5, then O2.5 lane at 4–6. Never mix lanes."""
    rng = rng or random.Random()
    blocked = set()
    found = []
    bounds = None
    # Asian Over 2 converted from cheap O1.5 stays in the same O1.5 ticket lane.
    o15_lane = _goals_desk_lane_pool(pool, 1.5) + _goals_desk_lane_pool(pool, 2.0)
    o25_lane = _goals_desk_lane_pool(pool, 2.5)
    lanes = (
        (o15_lane, 3.0, 5.0),
        (o25_lane, 4.0, 6.0),
    )
    soft_notes: list[str] = []
    for lane_pool, nominal_low, nominal_high in lanes:
        need = config.numberOfSlips - len(found)
        if need <= 0 or not lane_pool:
            continue
        band_low, band_high, soft_note = _goals_desk_lane_band(lane_pool, nominal_low, nominal_high)
        if soft_note:
            soft_notes.append(soft_note)
        least, most = target_leg_bounds(lane_pool, band_low, band_high)
        # Thin soft-floor days: allow using every unique leg on one ticket.
        events = len({s.eventId for s in lane_pool})
        if soft_note:
            least = max(1, min(least, events))
            most = max(most, events)
        scoped = config.model_copy(update={
            'numberOfSlips': need, 'minimumOdds': band_low, 'maximumOdds': band_high,
            'minimumSelections': least, 'maximumSelections': most,
        })
        tickets, possible = search(
            lane_pool, scoped, original, rng=rng, blocked=blocked, steer=True, attempt_limit=16000,
        )
        if possible:
            bounds = possible
        found.extend(tickets)
        for ticket in tickets:
            blocked.update(selection_key(s) for s in ticket['selections'])
    # Stash soft-floor notes on bounds dict so generate_report can surface them if needed.
    if soft_notes and isinstance(bounds, dict):
        bounds = {**bounds, 'goalsDeskSoftFloor': soft_notes}
    elif soft_notes and bounds is None:
        bounds = {'goalsDeskSoftFloor': soft_notes}
    return found[:config.numberOfSlips], bounds

def search_ggsp_plan(pool, config, original, rng=None):
    """Fill up to 10 tickets across the full 3–4 band; never reuse a fixture.

    Unlike Investor/Over15 sliced targets (±0.10), GGSP needs the whole band — CLEAN
    O1.5 pools are thin and each ~3.0 ticket burns 5–10 unique games.
    """
    rng = rng or random.Random()
    band_low, band_high = GGSP_ODDS
    least, most = target_leg_bounds(pool, band_low, band_high)
    scoped = config.model_copy(update={
        'numberOfSlips': config.numberOfSlips,
        'minimumOdds': band_low,
        'maximumOdds': band_high,
        'minimumSelections': least,
        'maximumSelections': most,
    })
    return search(
        pool, scoped, original, rng=rng, steer=True, attempt_limit=16000, unique_matches=True,
    )


def target_odds_window(target: float, config=None) -> tuple[float, float]:
    minimum, maximum = (config.minimumOdds, config.maximumOdds) if config else (3., 6.)
    return max(minimum, target - SYSTEM_ODDS_SPAN), min(maximum, target + SYSTEM_ODDS_SPAN)


def target_leg_bounds(pool, low: float, high: float) -> tuple[int, int]:
    prices = [s.odds for s in pool if s.odds > 1]
    if not prices:
        return 1, 50
    cheapest, dearest = min(prices), max(prices)
    minimum = 1
    while dearest ** minimum < low and minimum < 50:
        minimum += 1
    maximum = minimum
    while cheapest ** (maximum + 1) <= high and maximum < 50:
        maximum += 1
    return minimum, maximum


def search_system_plan(pool, config, original, rng=None):
    if config.riskMode == 'GOALS_DESK_V2':
        return search_goals_desk_plan(pool, config, original, rng=rng)
    if config.riskMode == 'GGSP_V11':
        return search_ggsp_plan(pool, config, original, rng=rng)
    rng = rng or random.Random()
    blocked = set()
    used_matches = set()
    remaining_pool = list(pool)
    found = []
    bounds = None
    unique_matches = _unique_matches_for(config)
    for target, count in mode_plan(config):
        need = min(count, config.numberOfSlips - len(found))
        if need <= 0:
            break
        if unique_matches and used_matches:
            remaining_pool = [s for s in remaining_pool if match_key(s) not in used_matches]
        low, high = target_odds_window(target, config)
        least, most = target_leg_bounds(remaining_pool, low, high)
        scoped = config.model_copy(update={
            'numberOfSlips': need, 'minimumOdds': low, 'maximumOdds': high,
            'minimumSelections': least, 'maximumSelections': most,
        })
        tickets, possible = search(
            remaining_pool, scoped, original, rng=rng, blocked=blocked, steer=True,
            attempt_limit=12000, unique_matches=unique_matches,
        )
        if possible:
            bounds = possible
        found.extend(tickets)
        for ticket in tickets:
            blocked.update(selection_key(s) for s in ticket['selections'])
            used_matches.update(match_key(s) for s in ticket['selections'])
    return found, bounds


def search(pool, config, original, allow_nearest=False, rng=None, blocked=(), steer=False, attempt_limit=None, unique_matches=None):
    events = event_choices(pool, config)
    if len(events) < config.minimumSelections:
        return [], None
    if unique_matches is None:
        unique_matches = _unique_matches_for(config)
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
    if not allow_nearest and (upper_bound < config.minimumOdds or (config.maximumOdds is not None and lower_bound > config.maximumOdds + .005)):
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
        odds = math.prod(s.odds for s in picked)
        within = math.isfinite(odds) and config.minimumOdds <= round(odds, 2) and (config.maximumOdds is None or round(odds, 2) <= config.maximumOdds)
        if not within and not allow_nearest:
            continue
        key = fingerprint(picked)
        if key == original_fingerprint:
            continue
        joint_log = sum(math.log(max(.000001, s.probability)) for s in picked)
        volatility = sum(math.log(s.odds) ** 2 for s in picked) / legs
        preference_count = sum(matches_preference(s, config) for s in picked)
        original_count = sum(s.eventId in original_ids for s in picked)
        ranking = joint_log + appetite * math.log(odds) - penalty * volatility
        candidate = {'selections': [s.model_dump(mode='json') for s in picked],
                     'totalOdds': round(odds, 2), 'slipScore': round(math.exp(joint_log) * 100, 8),
                     'fingerprint': key, '_rank': ranking, '_preferred': preference_count / legs,
                     '_original': original_count / legs}
        if within:
            results[key] = candidate
            if steer and attempt >= 300 and attempt % 50 == 0 and len(results) >= max(32, config.numberOfSlips * 16):
                probe = random.Random()
                probe.setstate(rng.getstate())
                enough = varied_candidates(
                    results.values(), config, probe, config.numberOfSlips, ceiling,
                    unique_matches=unique_matches,
                )
                if len(enough) == config.numberOfSlips:
                    break
            if len(results) > max(100, config.numberOfSlips * 12):
                retained = varied_candidates(
                    results.values(), config, rng, max(50, config.numberOfSlips * 6), ceiling,
                    original_keys if config.preserveOriginalSelections else (),
                    unique_matches=unique_matches,
                )
                results = {c['fingerprint']: c for c in retained}
        elif allow_nearest:
            candidate['_distance'] = max(math.log(config.minimumOdds / odds), math.log(odds / config.maximumOdds) if config.maximumOdds is not None else 0, 0)
            if len(nearest) < config.numberOfSlips * 4 or candidate['_distance'] < max(s['_distance'] for s in nearest.values()):
                nearest[key] = candidate
                if len(nearest) > config.numberOfSlips * 4:
                    del nearest[max(nearest, key=lambda k: nearest[k]['_distance'])]
    repeatable = original_keys if config.preserveOriginalSelections else ()
    ranked = varied_candidates(
        results.values(), config, rng, config.numberOfSlips, ceiling, repeatable,
        unique_matches=unique_matches,
    )
    if allow_nearest and len(ranked) < config.numberOfSlips:
        repeatable_keys = set(repeatable)
        used = set()
        used_matches = set()
        for ticket in ranked:
            used.update({selection_key(s) for s in ticket['selections']} - repeatable_keys)
            used_matches.update(match_key(s) for s in ticket['selections'])
        for candidate in sorted(nearest.values(), key=lambda c: (c['_distance'], -c['_rank'])):
            fresh = {selection_key(s) for s in candidate['selections']} - repeatable_keys
            if fresh & used:
                continue
            if unique_matches and ({match_key(s) for s in candidate['selections']} & used_matches):
                continue
            ranked.append(candidate)
            used.update(fresh)
            used_matches.update(match_key(s) for s in candidate['selections'])
            if len(ranked) >= config.numberOfSlips:
                break
    ranked.sort(key=lambda c: (c['_preferred'], c['_original'], c['_rank']), reverse=True)
    return ranked[:config.numberOfSlips], {'minimum': round(lower_bound, 2), 'maximum': round(min(upper_bound, 1e12), 2)}



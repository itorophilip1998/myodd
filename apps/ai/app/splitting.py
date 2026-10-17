"""Partition original picks exactly once. Risk modes affect grouping, never invent replacements."""
import math
import random
from .generation import eligible, fingerprint
from .schemas import Config, ScoredSelection, Selection


def split_report(pool: list[ScoredSelection], config: Config, original: list[Selection], parts: int):
    key = lambda s: (s.eventId, s.marketId, s.outcomeId, s.specifier)
    live = {key(s): s for s in pool if eligible(s, config)}
    original_keys = list(dict.fromkeys(key(s) for s in original))
    picks = [live[k] for k in original_keys if k in live]
    skipped = len(original_keys) - len(picks)
    notices = list(config.unhandledRequests)
    if skipped:
        notices.append(f'{skipped} original picks are unavailable or conflict with your filters and were skipped. No replacement matches were added.')
    strategy = {'VERY_LOW': 'balanced risk', 'LOWER': 'balanced risk', 'MODERATE': 'balanced sizes',
                'HIGHER': 'risk bands', 'VERY_HIGH': 'concentrated risk'}[config.riskPreference]
    report = {'notices': notices, 'needsExpansion': False, 'effectiveConfig': config.model_dump(mode='json'),
              'operation': 'split', 'splitDetails': {'requestedParts': parts, 'originalSelections': len(original_keys),
                'eligibleSelections': len(picks), 'skippedSelections': skipped, 'strategy': strategy},
              'diagnostics': {'requestedSlips': parts, 'foundSlips': 0, 'eligibleEvents': len({s.eventId for s in picks}),
                'preferredSelections': len(picks), 'selectionPool': len(picks), 'oddsBounds': None}, 'candidates': []}
    if not original_keys:
        notices.append('Paste a booking code to split its original selections.')
        return report
    if parts > len(picks):
        notices.append(f'Cannot make {parts} non-empty parts from {len(picks)} available picks. Choose at most {len(picks)} parts.')
        return report
    if len(picks) > parts * config.maximumSelections or len(picks) < parts * config.minimumSelections:
        notices.append('The part count conflicts with the minimum/maximum selections per code. Change the part count or selection limits.')
        return report
    if len({s.eventId for s in picks}) != len(picks):
        notices.append('This original contains multiple picks from one match. Exact splitting of same-match/bet-builder picks is not supported.')
        return report
    risk = lambda s: -math.log(max(.000001, min(.999999, s.probability)))
    groups = [[] for _ in range(parts)]
    if strategy == 'balanced risk':
        capacity = min(config.maximumSelections, math.ceil(len(picks) / parts))
        totals = [0.] * parts
        for pick in sorted(picks, key=risk, reverse=True):
            candidates = [i for i in range(parts) if len(groups[i]) < capacity]
            underfilled = [i for i in candidates if len(groups[i]) < config.minimumSelections]
            index = min(underfilled or candidates, key=lambda i: (totals[i], len(groups[i]), i))
            groups[index].append(pick)
            totals[index] += risk(pick)
    elif strategy == 'balanced sizes':
        for i, pick in enumerate(picks):
            groups[i % parts].append(pick)
    else:
        ordered = sorted(picks, key=risk, reverse=strategy == 'concentrated risk')
        for i in range(parts):
            size = (min(config.maximumSelections, len(ordered) - (parts - i - 1) * config.minimumSelections)
                    if strategy == 'concentrated risk' else len(picks) // parts + (i < len(picks) % parts))
            groups[i], ordered = ordered[:size], ordered[size:]
    def fits(group):
        odds = math.prod(s.odds for s in group)
        return (config.minimumSelections <= len(group) <= config.maximumSelections and math.isfinite(odds)
                and round(odds, 2) >= config.minimumOdds
                and (config.maximumOdds is None or round(odds, 2) <= config.maximumOdds))
    if not all(fits(group) for group in groups):
        # Respect hard odds bands without replacing any pick. Try bounded bin packing;
        # similar sizes are a preference, so e.g. a 9-odds leg can stand alone in Investor Mode.
        rng = random.Random(42)
        found = None
        for attempt in range(256):
            ordered = sorted(picks, key=lambda s: s.odds, reverse=True) if attempt % 3 == 0 else rng.sample(picks, len(picks))
            bins = [[] for _ in range(parts)]
            log_totals = [0.] * parts
            for n, pick in enumerate(ordered):
                choices = [i for i in range(parts) if len(bins[i]) < config.maximumSelections
                           and (config.maximumOdds is None or math.exp(log_totals[i]) * pick.odds < config.maximumOdds + .005)]
                choices = [i for i in choices if sum(max(0, config.minimumSelections - len(bins[j]) - (j == i)) for j in range(parts)) <= len(ordered) - n - 1]
                if not choices:
                    break
                underfilled = [i for i in choices if len(bins[i]) < config.minimumSelections or log_totals[i] < math.log(config.minimumOdds)]
                choices = underfilled or choices
                choices.sort(key=lambda i: (len(bins[i]), log_totals[i]) if strategy == 'balanced sizes' else
                             (-log_totals[i], len(bins[i])) if strategy == 'concentrated risk' else (log_totals[i], len(bins[i])))
                index = choices[0] if attempt == 0 else rng.choice(choices[:min(3, len(choices))])
                bins[index].append(pick)
                log_totals[index] += math.log(pick.odds)
            if sum(map(len, bins)) == len(picks) and all(fits(group) for group in bins):
                found = bins
                break
        if found:
            groups = found
    for group in groups:
        odds = round(math.prod(s.odds for s in group), 2)
        if not config.minimumSelections <= len(group) <= config.maximumSelections or (odds < config.minimumOdds or (config.maximumOdds is not None and odds > config.maximumOdds)):
            notices.append('The requested odds/selection limits cannot be met by this exact split. Change the number of parts, mode, or limits; original picks were not replaced.')
            return report
        if not all(any(team.casefold() in f'{s.homeTeam} {s.awayTeam}'.casefold() for s in group) for team in config.includedTeams):
            notices.append('A required team cannot appear in every non-overlapping part. Remove that per-code team requirement to split.')
            return report
    report['candidates'] = [{'selections': [s.model_dump(mode='json') for s in group],
                            'totalOdds': round(math.prod(s.odds for s in group), 2),
                            'slipScore': math.prod(s.probability for s in group) * 100,
                            'fingerprint': fingerprint(group)} for group in groups]
    report['diagnostics']['foundSlips'] = len(groups)
    notices.append(f'Split {len(picks)} available original picks into {parts} non-overlapping parts using {strategy}. Each pick appears once; no markets or matches were replaced.')
    return report

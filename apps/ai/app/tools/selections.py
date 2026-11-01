"""Selection identity, eligibility and market filtering shared by generation and splitting."""
import hashlib
from datetime import datetime, timezone

from .investor_markets import investor_market_allowed
from .odds_policy import within_mode_selection_odds


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
            and (config.marketPolicy != 'only' or matches_preference(selection, config) or matches_related(selection, config))
            and (config.riskMode not in ('INVESTOR', 'GAMBLER') or config.fixtureMode == 'original_only' or investor_market_allowed(
                selection.marketId, selection.marketName, selection.specifier, selection.selectionName)))


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



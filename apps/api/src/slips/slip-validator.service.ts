import { Inject, Injectable } from '@nestjs/common';
import { combinedOdds, withinModeOdds, type BookmakerFixture, type GenerationConfig, type ScoredSelection } from '@myodd/shared';
import { BOOKMAKER_PROVIDER, type BookmakerProvider } from '../bookmaker/bookmaker.provider';

@Injectable()
export class SlipValidatorService {
  constructor(@Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider) {}

  async validate(selections: ScoredSelection[], config: GenerationConfig, fixtures?: BookmakerFixture[], capture?: (fixtures: BookmakerFixture[]) => Promise<unknown>) {
    const current = fixtures ?? await this.bookmaker.getFixtures({ eventIds: selections.map(selection => selection.eventId) });
    if (capture) await capture(current);
    const events = new Map(current.map(f => [f.eventId, f]));
    const seen = new Set<string>();
    const validated: ScoredSelection[] = [];
    for (const leg of selections) {
      const event = events.get(leg.eventId);
      const market = event?.markets.find(m => m.marketId === leg.marketId && (m.specifier ?? '') === (leg.specifier ?? ''));
      const outcome = market?.outcomes.find(o => o.outcomeId === leg.outcomeId && o.isActive);
      if (!event || !market || !outcome || seen.has(leg.eventId) || !Number.isFinite(outcome.odds) || outcome.odds <= 1) return null;
      if (!['', '0', 'active', 'open'].includes(market.status.toLowerCase())) return null;
      const kickoff = new Date(event.kickoffAt).getTime();
      if (!Number.isFinite(kickoff) || kickoff <= Date.now()) return null;
      if (config.kickoffBefore && kickoff > new Date(config.kickoffBefore).getTime()) return null;
      if (config.kickoffAfter && kickoff < new Date(config.kickoffAfter).getTime()) return null;
      if (config.marketPolicy === 'only') {
        const rules = [...(config.marketRules ?? []), ...(config.relatedMarketRules ?? [])];
        const matches = rules.length ? config.markets.includes(leg.supportedMarket) || rules.some(rule =>
          rule.marketId === leg.marketId && (rule.specifier === null || rule.specifier === leg.specifier)
          && (!rule.outcomeIds.length || rule.outcomeIds.includes(leg.outcomeId)))
          : config.markets.length ? config.markets.includes(leg.supportedMarket) : !config.marketQueries?.length;
        if (!matches) return null;
      }
      const teams = `${event.homeTeam} ${event.awayTeam}`.toLowerCase();
      if (config.excludedTeams.some(t => teams.includes(t.toLowerCase()))) return null;
      const league = event.league?.toLowerCase() ?? '';
      if (config.excludedLeagues?.some(l => league.includes(l.toLowerCase()))) return null;
      if (config.includedLeagues?.length && !config.includedLeagues.some(l => league.includes(l.toLowerCase()))) return null;
      if (config.minimumProbability != null && leg.probability < config.minimumProbability) return null;
      seen.add(leg.eventId);
      validated.push({ ...leg, odds: outcome.odds, homeTeam: event.homeTeam, awayTeam: event.awayTeam, kickoffAt: event.kickoffAt });
    }
    if (config.includedTeams?.some(team => !validated.some(s => `${s.homeTeam} ${s.awayTeam}`.toLowerCase().includes(team.toLowerCase())))) return null;
    const odds = combinedOdds(validated.map(s => s.odds!));
    if (!withinModeOdds(odds, config.riskMode) || validated.length < config.minimumSelections || validated.length > config.maximumSelections || odds < config.minimumOdds || (config.maximumOdds != null && odds > config.maximumOdds)) return null;
    return validated;
  }
}

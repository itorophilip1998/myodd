import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BookmakerSelection, ScoredSelection } from '@myodd/shared';
import {
  BOOKMAKER_PROVIDER,
  type BookmakerProvider,
} from '../bookmaker/bookmaker.provider';

@Injectable()
export class SlipValidatorService {
  private readonly logger = new Logger(SlipValidatorService.name);

  constructor(
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
  ) {}

  async validateAndRepair(
    slip: ScoredSelection[],
    pool: ScoredSelection[],
  ): Promise<ScoredSelection[] | null> {
    const fixtures = await this.bookmaker.getFixtures({
      timelineHours: 72,
      pageSize: 100,
      todayGames: false,
    });
    const byEvent = new Map(fixtures.map((f) => [f.eventId, f]));

    const validated: ScoredSelection[] = [];
    const usedEvents = new Set<string>();

    for (const leg of slip) {
      const fixture = byEvent.get(leg.eventId);
      if (!fixture) {
        const replacement = findReplacement(leg, pool, usedEvents, validated);
        if (!replacement) return null;
        validated.push(replacement);
        usedEvents.add(replacement.eventId);
        continue;
      }

      const market = fixture.markets.find(
        (m) =>
          m.marketId === leg.marketId &&
          (m.specifier ?? '') === (leg.specifier ?? ''),
      );
      const outcome = market?.outcomes.find(
        (o) => o.outcomeId === leg.outcomeId && o.isActive,
      );

      if (!market || !outcome) {
        this.logger.debug(
          `Unavailable leg ${leg.eventId}/${leg.marketId}/${leg.outcomeId}`,
        );
        const replacement = findReplacement(leg, pool, usedEvents, validated);
        if (!replacement) return null;
        validated.push(replacement);
        usedEvents.add(replacement.eventId);
        continue;
      }

      validated.push({
        ...leg,
        odds: outcome.odds,
        isActive: true,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        league: fixture.league,
        kickoffAt: fixture.kickoffAt,
      });
      usedEvents.add(leg.eventId);
    }

    return validated;
  }
}

function findReplacement(
  original: ScoredSelection,
  pool: ScoredSelection[],
  usedEvents: Set<string>,
  current: BookmakerSelection[],
): ScoredSelection | null {
  const usedKeys = new Set(
    current.map(
      (s) => `${s.eventId}|${s.marketId}|${s.outcomeId}|${s.specifier ?? ''}`,
    ),
  );

  const candidates = pool
    .filter((p) => !usedEvents.has(p.eventId))
    .filter(
      (p) =>
        !usedKeys.has(
          `${p.eventId}|${p.marketId}|${p.outcomeId}|${p.specifier ?? ''}`,
        ),
    )
    .filter((p) => p.supportedMarket === original.supportedMarket)
    .sort((a, b) => b.confidence - a.confidence);

  return candidates[0] ?? null;
}

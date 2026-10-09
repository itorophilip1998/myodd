import { Inject, Injectable } from '@nestjs/common';
import {
  SPORTYBET_MARKET_IDS,
  SupportedMarket,
  type BookmakerFixture,
  type BookmakerSelection,
  type ScoredSelection,
} from '@myodd/shared';
import { PREDICTION_ENGINE, type PredictionEngine } from './prediction.engine';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PredictionsService {
  constructor(
    @Inject(PREDICTION_ENGINE) private readonly engine: PredictionEngine,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  scoreFixtures(fixtures: BookmakerFixture[]): ScoredSelection[] {
    const scored: ScoredSelection[] = [];
    for (const fixture of fixtures) {
      for (const market of fixture.markets) {
        for (const outcome of market.outcomes) {
          if (!outcome.isActive) continue;
          const mapped = mapSupportedMarket(
            market.marketId,
            market.specifier,
            outcome.outcomeId,
            outcome.outcomeName,
          );
          if (!mapped) continue;

          const selection: BookmakerSelection = {
            eventId: fixture.eventId,
            marketId: market.marketId,
            outcomeId: outcome.outcomeId,
            specifier: market.specifier,
            odds: outcome.odds,
            marketName: market.marketName,
            selectionName: outcome.outcomeName,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            league: fixture.league,
            kickoffAt: fixture.kickoffAt,
            isActive: outcome.isActive,
          };

          const result = this.engine.score(selection, {
            marketOutcomes: market.outcomes,
            supportedMarket: mapped,
          });

          scored.push({
            ...selection,
            supportedMarket: mapped,
            ...result,
          });
        }
      }
    }
    return scored;
  }

  async cacheScores(scores: ScoredSelection[]): Promise<void> {
    for (const s of scores.slice(0, 200)) {
      const key = `pred:${s.eventId}:${s.marketId}:${s.outcomeId}:${s.specifier}`;
      await this.redis.setJson(
        key,
        {
          probability: s.probability,
          confidence: s.confidence,
          modelVersion: s.modelVersion,
        },
        15 * 60,
      );
    }

    // Persist a sample for observability (best-effort)
    try {
      await this.prisma.prediction.createMany({
        data: scores.slice(0, 50).map((s) => ({
          eventId: s.eventId,
          market: s.supportedMarket,
          selection: s.selectionName ?? s.outcomeId,
          probability: s.probability,
          confidence: s.confidence,
          modelVersion: s.modelVersion,
        })),
      });
    } catch {
      // ignore persistence failures
    }
  }
}

export function mapSupportedMarket(
  marketId: string,
  specifier: string,
  outcomeId: string,
  outcomeName: string,
): SupportedMarket | null {
  const name = outcomeName.toLowerCase();
  const spec = specifier.toLowerCase();

  if (marketId === SPORTYBET_MARKET_IDS.MATCH_RESULT) {
    if (outcomeId === '1' || name.includes('home') || name === '1') {
      return SupportedMarket.HOME;
    }
    if (outcomeId === '3' || name.includes('away') || name === '2') {
      return SupportedMarket.AWAY;
    }
    return null; // skip draw-only for V1 moneyline
  }

  if (marketId === SPORTYBET_MARKET_IDS.DOUBLE_CHANCE) {
    if (name.includes('1x') || name === '1x' || outcomeId === '9') {
      return SupportedMarket.DOUBLE_CHANCE_1X;
    }
    if (name.includes('x2') || name === 'x2' || outcomeId === '11') {
      return SupportedMarket.DOUBLE_CHANCE_X2;
    }
    if (name.includes('12') || name === '12' || outcomeId === '10') {
      return SupportedMarket.DOUBLE_CHANCE_12;
    }
  }

  if (marketId === SPORTYBET_MARKET_IDS.OVER_UNDER) {
    const isOver = name.includes('over') || outcomeId === '12';
    const isUnder = name.includes('under') || outcomeId === '13';
    if (spec.includes('total=1.5') || name.includes('1.5')) {
      return isOver ? SupportedMarket.OVER_1_5 : null;
    }
    if (spec.includes('total=2.5') || name.includes('2.5')) {
      return isOver ? SupportedMarket.OVER_2_5 : null;
    }
    if (spec.includes('total=3.5') || name.includes('3.5')) {
      return isUnder ? SupportedMarket.UNDER_3_5 : null;
    }
  }

  if (marketId === SPORTYBET_MARKET_IDS.BTTS) {
    if (name.includes('yes') || outcomeId === '74') {
      return SupportedMarket.BTTS_YES;
    }
    if (name.includes('no') || outcomeId === '76') {
      return SupportedMarket.BTTS_NO;
    }
  }

  return null;
}

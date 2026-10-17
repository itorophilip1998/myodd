import { Injectable } from '@nestjs/common';
import type { ScoredSelection } from '@myodd/shared';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

/** Stores Python model outputs. Never computes predictions. */
@Injectable()
export class PredictionsService {
  constructor(private readonly redis: RedisService, private readonly prisma: PrismaService) {}

  async cacheScores(scores: ScoredSelection[]) {
    await Promise.all(scores.slice(0, 200).map(s => this.redis.setJson(
      `pred:${s.eventId}:${s.marketId}:${s.outcomeId}:${s.specifier}`,
      { probability: s.probability, confidence: s.confidence, modelVersion: s.modelVersion }, 900,
    )));
    if (scores.length) await this.prisma.prediction.createMany({
      data: scores.map(s => ({ eventId: s.eventId, market: s.supportedMarket,
        selection: s.selectionName ?? s.outcomeId, probability: s.probability,
        confidence: s.confidence, modelVersion: s.modelVersion })),
    });
  }
}

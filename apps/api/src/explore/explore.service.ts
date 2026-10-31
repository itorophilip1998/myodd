import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { BOOKMAKER_PROVIDER, BookmakerProvider } from '../bookmaker/bookmaker.provider';
import { AiClient } from '../ai/ai.client';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { PredictionsService } from '../predictions/predictions.service';
import { Prisma } from '@prisma/client';
import { matchesPredictionMarket, type PredictionMarket } from '@myodd/shared';

@Injectable()
export class ExploreService {
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(@Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
    private readonly ai: AiClient, private readonly redis: RedisService, private readonly prisma: PrismaService,
    private readonly scores: PredictionsService) {}

  private async snapshot<T>(key: string, seconds: number, work: () => Promise<T>): Promise<T> {
    const cached = await this.redis.getJson<T>(key);
    if (cached) return cached;
    const active = this.pending.get(key); if (active) return active as Promise<T>;
    const task = work().then(async value => { await this.redis.setJson(key, value, seconds); return value; });
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }

  live() {
    return this.snapshot('explore:live:v1', 10, async () => {
      try {
        const fixtures = await this.bookmaker.getLiveFixtures();
        const games = fixtures.map(({ markets: _markets, ...game }) => game);
        const observedAt = new Date().toISOString();
        await this.prisma.trainingEvent.create({ data: { kind: 'LIVE_GAMES_SNAPSHOT', payload: JSON.parse(JSON.stringify({ games, observedAt, source: 'SportyBet' })) } });
        return { games, observedAt, source: 'SportyBet', refreshSeconds: 15 };
      } catch { throw new BadGatewayException('The live football feed is temporarily unavailable. Please retry.'); }
    });
  }

  async predictions(options: { market?: PredictionMarket; eventId?: string; limit?: number } = {}) {
    const snapshot = await this.snapshot('explore:predictions:v2', 90, async () => {
      const pages = [];
      for (let pageNum = 1; pageNum <= 4; pageNum += 1) {
        const page = await this.bookmaker.getFixtures({ pageNum, pageSize: 100, timelineHours: 72, todayGames: false });
        pages.push(...page);
        if (page.length < 100) break;
      }
      const listed = [...new Map(pages.map(f => [f.eventId, f])).values()]
        .filter(f => Number.isFinite(Date.parse(f.kickoffAt)) && Date.parse(f.kickoffAt) > Date.now());
      // Listings often contain only 1X2. Load real alternate markets for upcoming games,
      // retaining listing data if enrichment is unavailable.
      const detailed = listed.length ? await this.bookmaker.getFixtures({ eventIds: listed.slice(0, 60).map(f => f.eventId) }).catch(() => []) : [];
      const byId = new Map(detailed.map(f => [f.eventId, f]));
      const fixtures = listed.map(f => {
        const detail = byId.get(f.eventId);
        if (!detail) return f;
        const markets = [...new Map([...f.markets, ...detail.markets].map(m => [`${m.marketId}:${m.specifier}`, m])).values()];
        return { ...f, markets };
      });
      const result = await this.ai.predict(fixtures);
      await this.scores.cacheScores(result.pool);
      const observedAt = new Date().toISOString();
      await this.prisma.trainingEvent.create({ data: { kind: 'PREDICTION_BROWSE_SNAPSHOT', payload: JSON.parse(JSON.stringify({ fixtures, ...result, observedAt })) as Prisma.InputJsonValue } });
      const games = fixtures.map(({ markets: _markets, ...fixture }) => ({ ...fixture,
        predictions: result.pool.filter(s => s.eventId === fixture.eventId).map(s => ({ marketId: s.marketId, outcomeId: s.outcomeId,
          specifier: s.specifier, marketName: s.marketName, selectionName: s.selectionName, odds: s.odds, probability: s.probability,
          modelVersion: s.modelVersion, supportedMarket: s.supportedMarket })) })).filter(f => f.predictions.length);
      return { games, observedAt, modelVersion: result.modelVersion, source: 'SportyBet · Python prediction service' };
    });
    // Retain the complete snapshot locally, but never send the entire training pool
    // to a browser. Fetch additional outcomes only when a user expands a game.
    return { ...snapshot, games: snapshot.games.filter(g => !options.eventId || g.eventId === options.eventId).map(g => {
      const matching = g.predictions.filter(p => matchesPredictionMarket(p, options.market ?? 'all')).sort((a, b) => b.probability - a.probability);
      return { ...g, predictionCount: matching.length, predictions: matching.slice(0, options.limit ?? 50) };
    }).filter(g => g.predictionCount > 0) };
  }
}

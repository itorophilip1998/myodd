import { Injectable, NotFoundException } from '@nestjs/common';
import { SPORTYBET_MARKET_IDS } from '@myodd/shared';
import type {
  LiveFixture,
  BookmakerBooking,
  BookmakerFixture,
  BookmakerMarket,
  BookmakerSelection,
} from '@myodd/shared';
import type { BookmakerProvider, FixturesQuery } from './bookmaker.provider';
import { SportyBetClient, SportyBetHttpError } from './sportybet.client';
import {
  mapFixtures,
  mapLiveFixtures,
  mapEvent,
  mapShareResponse,
  toSharePayload,
} from './sportybet.mapper';

const DEFAULT_MARKETS = [
  SPORTYBET_MARKET_IDS.MATCH_RESULT,
  SPORTYBET_MARKET_IDS.DOUBLE_CHANCE,
  SPORTYBET_MARKET_IDS.OVER_UNDER,
  SPORTYBET_MARKET_IDS.BTTS,
].join(',');

@Injectable()
export class SportyBetProvider implements BookmakerProvider {
  constructor(private readonly client: SportyBetClient) {}

  async getLiveFixtures(): Promise<LiveFixture[]> {
    const region = this.client.regionCode;
    const data = await this.client.get<Parameters<typeof mapLiveFixtures>[0]>(
      `/api/${region}/factsCenter/configurableLiveOrPrematchEvents?sportId=sr%3Asport%3A1&withTwoUpMarket=true&withOneUpMarket=true&_t=${Date.now()}`,
      { retries: 1 },
    );
    if (!Array.isArray(data)) throw new Error('Live football feed returned an unexpected format');
    return mapLiveFixtures(data);
  }

  async getFixtures(query: FixturesQuery = {}): Promise<BookmakerFixture[]> {
    const region = this.client.regionCode;
    if (query.eventIds) {
      const ids = [...new Set(query.eventIds)];
      const results = await Promise.allSettled(ids.map(async eventId => {
        const data = await this.client.get<Parameters<typeof mapEvent>[0]>(
          `/api/${region}/factsCenter/event?eventId=${encodeURIComponent(eventId)}`,
          { cacheKey: query.fresh ? undefined : `sporty:event:${region}:${eventId}` },
        );
        return mapEvent(data);
      }));
      const fixtures = results.filter((result): result is PromiseFulfilledResult<BookmakerFixture> => result.status === 'fulfilled').map(result => result.value);
      if (ids.length && !fixtures.length) throw (results[0] as PromiseRejectedResult).reason;
      return fixtures;
    }
    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const pageNum = query.pageNum ?? 1;
    const timeline = Math.min(query.timelineHours ?? 48, 720);
    const marketId = (query.marketIds ?? DEFAULT_MARKETS.split(',')).join(',');
    const todayGames = query.todayGames ?? true;
    const t = Date.now();
    const path =
      `/api/${region}/factsCenter/pcUpcomingEvents` +
      `?sportId=sr:sport:1` +
      `&marketId=${encodeURIComponent(marketId)}` +
      `&pageSize=${pageSize}` +
      `&pageNum=${pageNum}` +
      `&todayGames=${todayGames}` +
      `&timeline=${timeline}` +
      `&_t=${t}`;

    const cacheKey = `sporty:fixtures:${region}:${pageNum}:${pageSize}:${timeline}:${todayGames}:${marketId}`;
    const data = await this.client.get<{
      totalNum?: number;
      tournaments?: unknown[];
    }>(path, { cacheKey });
    return mapFixtures(data as never);
  }

  async getMarkets(eventId: string): Promise<BookmakerMarket[]> {
    const fixtures = await this.getFixtures({
      eventIds: [eventId],
    });
    const match = fixtures.find((f) => f.eventId === eventId);
    if (!match) {
      throw new NotFoundException(`Event not found: ${eventId}`);
    }
    return match.markets;
  }

  async getBooking(code: string, options: { fresh?: boolean } = {}): Promise<BookmakerBooking> {
    const region = this.client.regionCode;
    const normalized = code.trim().toUpperCase();
    const path = `/api/${region}/orders/share/${encodeURIComponent(normalized)}`;
    const cacheKey = `sporty:booking:${region}:${normalized}`;
    try {
      const data = await this.client.get<Record<string, unknown>>(path, {
        cacheKey: options.fresh ? undefined : cacheKey,
        retries: 2,
      });
      return mapShareResponse(data as never, region);
    } catch (err) {
      if (err instanceof SportyBetHttpError && err.code === 'NOT_FOUND') {
        throw new NotFoundException(`Booking code not found: ${normalized}`);
      }
      if ((err as Error).message === 'NO_BOOKING_CODE') {
        throw new NotFoundException(`Booking code not found: ${normalized}`);
      }
      throw err;
    }
  }

  async createBooking(
    selections: BookmakerSelection[],
  ): Promise<BookmakerBooking> {
    if (selections.length === 0) {
      throw new SportyBetHttpError('No selections provided', 'BAD_REQUEST');
    }
    const region = this.client.regionCode;
    const path = `/api/${region}/orders/share`;
    const payload = toSharePayload(selections);
    const data = await this.client.post<Record<string, unknown>>(path, payload);
    const booking = mapShareResponse(data as never, region);
    // Creation may return only the code; read it back to verify the accepted outcomes and prices.
    return this.getBooking(booking.code, { fresh: true });
  }
}

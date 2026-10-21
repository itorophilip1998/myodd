import type {
  LiveFixture,
  BookmakerBooking,
  BookmakerFixture,
  BookmakerMarket,
  BookmakerSelection,
} from '@myodd/shared';

export interface FixturesQuery {
  fresh?: boolean;
  eventIds?: string[];
  timelineHours?: number;
  pageSize?: number;
  pageNum?: number;
  todayGames?: boolean;
  marketIds?: string[];
}

export interface BookmakerProvider {
  getLiveFixtures(): Promise<LiveFixture[]>;
  getFixtures(query?: FixturesQuery): Promise<BookmakerFixture[]>;
  getMarkets(eventId: string): Promise<BookmakerMarket[]>;
  getBooking(code: string, options?: { fresh?: boolean }): Promise<BookmakerBooking>;
  createBooking(selections: BookmakerSelection[]): Promise<BookmakerBooking>;
}

export const BOOKMAKER_PROVIDER = Symbol('BOOKMAKER_PROVIDER');

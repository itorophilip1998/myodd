import type {
  BookmakerBooking,
  BookmakerFixture,
  BookmakerMarket,
  BookmakerSelection,
} from '@myodd/shared';

export interface FixturesQuery {
  timelineHours?: number;
  pageSize?: number;
  pageNum?: number;
  todayGames?: boolean;
  marketIds?: string[];
}

export interface BookmakerProvider {
  getFixtures(query?: FixturesQuery): Promise<BookmakerFixture[]>;
  getMarkets(eventId: string): Promise<BookmakerMarket[]>;
  getBooking(code: string): Promise<BookmakerBooking>;
  createBooking(selections: BookmakerSelection[]): Promise<BookmakerBooking>;
}

export const BOOKMAKER_PROVIDER = Symbol('BOOKMAKER_PROVIDER');

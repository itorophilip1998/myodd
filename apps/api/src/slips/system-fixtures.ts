import { SYSTEM_LISTING_MARKET_IDS, systemFixture, type BookmakerFixture, type MatchDayWindow } from '@myodd/shared';
import type { BookmakerProvider } from '../bookmaker/bookmaker.provider';

const PAGE_SIZE = 100, MAX_PAGES = 50;
export interface SystemFixtureSnapshot {
  fixtures: BookmakerFixture[];
  coverage: { listedGames: number; dayGames: number; leagues: number; gamesWithOptions: number;
    detailGames: number; missingDetails: number; listingTruncated: boolean; listingFailures: number };
  notices: string[];
}
function inWindow(fixture: BookmakerFixture, window: MatchDayWindow) {
  const kickoff = Date.parse(fixture.kickoffAt);
  return kickoff > Date.now() && kickoff >= Date.parse(window.kickoffAfter) && kickoff < Date.parse(window.kickoffBefore)
    && !/live|inplay|in play|finished|ended|closed|complete/i.test(fixture.matchStatus ?? '');
}

export class SystemFixtureLoader {
  private readonly snapshots = new Map<string, { until: number; value: Promise<SystemFixtureSnapshot> }>();
  constructor(private readonly provider: BookmakerProvider) {}

  async load(window: MatchDayWindow): Promise<SystemFixtureSnapshot> {
    const key = `${window.matchDate}:${window.matchDateEnd}:${window.kickoffBefore.slice(0, 16)}`;
    let entry = this.snapshots.get(key);
    if (!entry || entry.until <= Date.now()) {
      const value = this.fetch(window);
      entry = { until: Infinity, value }; this.snapshots.set(key, entry);
      try { const snapshot = await value; entry.until = Date.now() + (snapshot.notices.length ? 5000 : 30000); }
      catch (error) { this.snapshots.delete(key); throw error; }
      if (this.snapshots.size > 8) for (const [oldKey, old] of this.snapshots) if (oldKey !== key && old.until !== Infinity) this.snapshots.delete(oldKey);
    }
    const snapshot = await entry.value;
    const fixtures = snapshot.fixtures.filter(f => inWindow(f, window));
    return { ...snapshot, fixtures, coverage: { ...snapshot.coverage, gamesWithOptions: fixtures.length } };
  }

  private async fetch(window: MatchDayWindow): Promise<SystemFixtureSnapshot> {
    const timelineHours = Math.min(168, Math.max(24, Math.ceil((Date.parse(window.kickoffBefore) - Date.now()) / 3600000) + 6));
    const listed = new Map<string, BookmakerFixture>();
    let ended = false, failures = 0;
    // Ask the daily listing for the provided option IDs. Do not open match boards to hunt extras.
    for (let first = 1; first <= MAX_PAGES && !ended; first += 4) {
      const results = await Promise.allSettled(Array.from({ length: Math.min(4, MAX_PAGES - first + 1) }, (_, index) =>
        this.provider.getFixtures({ pageNum: first + index, pageSize: PAGE_SIZE, timelineHours,
          todayGames: false, marketIds: SYSTEM_LISTING_MARKET_IDS, systemOnly: true })));
      for (const result of results) {
        if (result.status === 'rejected') { failures++; continue; }
        for (const fixture of result.value) listed.set(fixture.eventId, fixture);
        if (result.value.length < PAGE_SIZE) ended = true;
      }
      if (results.every(result => result.status === 'rejected')) break;
    }
    if (!listed.size && failures) throw new Error('The daily football feed is unavailable. Please retry.');
    const day = [...listed.values()].filter(f => inWindow(f, window)).sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.eventId.localeCompare(b.eventId));
    const fixtures = day.map(systemFixture).filter(f => f.markets.length);
    const notices = [failures ? `${failures} daily fixture pages were unavailable; coverage is partial.` : '',
      !ended ? 'The daily fixture listing reached its 5000-game bound or was incomplete; coverage is partial.' : '',
    ].filter(Boolean);
    return { fixtures, notices, coverage: { listedGames: listed.size, dayGames: day.length,
      leagues: new Set(day.map(f => f.league)).size, gamesWithOptions: fixtures.length,
      detailGames: 0, missingDetails: 0, listingTruncated: !ended, listingFailures: failures } };
  }
}

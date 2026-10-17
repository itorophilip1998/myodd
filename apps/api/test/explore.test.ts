import { describe, expect, it, vi } from 'vitest';
import { mapLiveFixtures } from '../src/bookmaker/sportybet.mapper';
import { ExploreService } from '../src/explore/explore.service';
const raw: any = [{ name: 'League', categoryName: 'Country', events: [
  { eventId: 'live', status: 1, matchStatus: 'H2', estimateStartTime: Date.now() - 3600000, homeTeamName: 'A', awayTeamName: 'B', setScore: '0:0', playedSeconds: '62:17' },
  { eventId: 'soon', status: 0, matchStatus: 'Not start', estimateStartTime: Date.now() + 3600000 },
  { eventId: 'done', status: 2, matchStatus: 'Ended', estimateStartTime: Date.now() - 7200000 },
] }];
describe('real live feed boundary', () => {
  it('keeps only genuine live events and preserves zero scores and reported clocks', () => {
    const games = mapLiveFixtures(raw);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ eventId: 'live', score: '0 : 0', clock: '62:17', liveStatus: 'H2', league: 'League' });
  });
  it('does not fabricate missing scores or match clocks', () => {
    const games = mapLiveFixtures([{ ...raw[0], events: [{ ...raw[0].events[0], setScore: 'unknown', playedSeconds: '' }] }]);
    expect(games[0]).toMatchObject({ score: null, clock: null });
  });
  it('coalesces concurrent refreshes and archives exactly the displayed live snapshot', async () => {
    const bookmaker = { getLiveFixtures: vi.fn().mockResolvedValue(mapLiveFixtures(raw)) };
    const redis = { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn() };
    const create = vi.fn();
    const service = new ExploreService(bookmaker as any, {} as any, redis as any, { trainingEvent: { create } } as any, {} as any);
    const [a, b] = await Promise.all([service.live(), service.live()]);
    expect(bookmaker.getLiveFixtures).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(create.mock.calls[0][0].data.kind).toBe('LIVE_GAMES_SNAPSHOT');
    expect(create.mock.calls[0][0].data.payload.games).toEqual(a.games);
    expect(a.games[0]).not.toHaveProperty('markets');
  });
  it('keeps in-play and ended fixtures out of pre-match prediction requests', async () => {
    const fixture = { eventId: 'future', kickoffAt: '2099-01-01T00:00:00Z', markets: [] };
    const ai = { predict: vi.fn().mockResolvedValue({ pool: [], modelVersion: 'odds-v2' }) };
    const service = new ExploreService({ getFixtures: vi.fn().mockResolvedValue([fixture, { ...fixture, eventId: 'past', kickoffAt: '2000-01-01T00:00:00Z' }]) } as any, ai as any,
      { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn() } as any, { trainingEvent: { create: vi.fn() } } as any, { cacheScores: vi.fn() } as any);
    await service.predictions();
    expect(ai.predict).toHaveBeenCalledWith([fixture]);
  });
});


describe('prediction alternate-market feed', () => {
  it('enriches real corners and preserves listing markets before scoring and journaling', async () => {
    const base = { eventId: 'future', kickoffAt: '2099-01-01T00:00:00Z', markets: [{ marketId: '1', specifier: '', marketName: '1X2', outcomes: [] }] };
    const corner = { marketId: 'corner-total', specifier: 'total=9.5', marketName: 'Total Corners', outcomes: [] };
    const getFixtures = vi.fn().mockImplementation(async q => q.eventIds ? [{ ...base, markets: [corner] }] : [base]);
    const predict = vi.fn().mockResolvedValue({ pool: [], modelVersion: 'odds-v2' });
    const create = vi.fn();
    const service = new ExploreService({ getFixtures } as any, { predict } as any,
      { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn() } as any, { trainingEvent: { create } } as any, { cacheScores: vi.fn() } as any);
    await service.predictions();
    expect(getFixtures).toHaveBeenCalledWith({ eventIds: ['future'] });
    expect(predict.mock.calls[0][0][0].markets).toEqual([base.markets[0], corner]);
    expect(create.mock.calls[0][0].data.payload.fixtures[0].markets).toEqual([base.markets[0], corner]);
  });
  it('keeps listing predictions when detailed markets are temporarily unavailable', async () => {
    const base = { eventId: 'future', kickoffAt: '2099-01-01T00:00:00Z', markets: [] };
    const getFixtures = vi.fn().mockImplementation(async q => { if (q.eventIds) throw new Error('upstream unavailable'); return [base]; });
    const predict = vi.fn().mockResolvedValue({ pool: [], modelVersion: 'odds-v2' });
    const service = new ExploreService({ getFixtures } as any, { predict } as any,
      { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn() } as any, { trainingEvent: { create: vi.fn() } } as any, { cacheScores: vi.fn() } as any);
    await service.predictions();
    expect(predict).toHaveBeenCalledWith([base]);
  });
});

describe('bounded browser prediction responses', () => {
  const fixture = (eventId: string) => ({ eventId, kickoffAt: '2099-01-01T00:00:00Z', predictions: [
    ...Array.from({ length: 100 }, (_, n) => ({ marketId: '18', marketName: 'Over/Under', selectionName: `Over ${n}.5`, probability: .4 + n / 1000 })),
    { marketId: '166', marketName: 'Corners - Over/Under', selectionName: 'Under 9.5', probability: .6 },
  ] });
  const snapshot = { games: [fixture('a'), fixture('b')], observedAt: '2099-01-01T00:00:00Z', source: 'SportyBet', modelVersion: 'odds-v2' };
  const service = () => new ExploreService({} as any, {} as any, { getJson: vi.fn().mockResolvedValue(snapshot) } as any, {} as any, {} as any);
  it('caps initial outcomes while reporting the full available count', async () => {
    const data = await service().predictions();
    expect(data.games).toHaveLength(2);
    expect(data.games[0].predictions).toHaveLength(50);
    expect(data.games[0].predictionCount).toBe(101);
  });
  it('filters the full snapshot before limiting so specialist markets are retained', async () => {
    const data = await service().predictions({ market: 'corners' });
    expect(data.games[0].predictionCount).toBe(1);
    expect(data.games[0].predictions[0].marketId).toBe('166');
  });
  it('retrieves additional outcomes only for the expanded game', async () => {
    const data = await service().predictions({ eventId: 'b', limit: 100 });
    expect(data.games.map(g => g.eventId)).toEqual(['b']);
    expect(data.games[0].predictions).toHaveLength(100);
    expect(snapshot.games[1].predictions).toHaveLength(101);
  });
});

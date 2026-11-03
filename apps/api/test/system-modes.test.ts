import { afterEach, expect, it, vi } from 'vitest';
import { SYSTEM_LISTING_MARKET_IDS, systemFixture, systemSelectionAllowed, type BookmakerFixture, type MatchDayWindow } from '@myodd/shared';
import { SystemFixtureLoader } from '../src/slips/system-fixtures';
import { systemConfig } from '../src/slips/system-config';
import { SlipsService } from '../src/slips/slips.service';

const window: MatchDayWindow = { matchDate: '2099-01-01', matchDateEnd: '2099-01-01', kickoffAfter: '2098-12-31T23:00:00Z', kickoffBefore: '2099-01-01T23:00:00Z', within24Hours: false, label: '2099-01-01' };
const outcome = { outcomeId: '9', outcomeName: '1X', odds: 1.25, isActive: true };
function fixture(id: number, approved = true): BookmakerFixture {
  return { eventId: String(id), homeTeam: `Home ${id}`, awayTeam: `Away ${id}`, league: `League ${id % 20}`, categoryName: 'Football', kickoffAt: '2099-01-01T12:00:00Z', matchStatus: 'Not started',
    markets: [{ marketId: approved ? '10' : '1', marketName: approved ? 'Double Chance' : '1X2', specifier: '', status: 'active', outcomes: [approved ? outcome : { ...outcome, outcomeId: '1', outcomeName: 'Home' }] }] };
}
afterEach(() => vi.restoreAllMocks());

it('over 1.5 machine allows totals with the O1.5→O2.5 price rule and 1.25 leg cap', () => {
  const ou = { marketId: '18', marketName: 'Over/Under', specifier: 'total=1.5', status: 'open', outcomes: [] };
  expect(systemSelectionAllowed(ou, { ...outcome, outcomeName: 'Over 1.5', odds: 1.18 }, 'OVER15_MACHINE')).toBe(true);
  // Cheap O1.5 stays on the listing so AI can switch that event to O2.5.
  expect(systemSelectionAllowed(ou, { ...outcome, outcomeName: 'Over 1.5', odds: 1.08 }, 'OVER15_MACHINE')).toBe(true);
  expect(systemSelectionAllowed(ou, { ...outcome, outcomeName: 'Over 1.5', odds: 1.26 }, 'OVER15_MACHINE')).toBe(false);
  expect(systemSelectionAllowed({ ...ou, specifier: 'total=2.5' }, { ...outcome, outcomeName: 'Over 2.5', odds: 1.20 }, 'OVER15_MACHINE')).toBe(true);
  expect(systemSelectionAllowed({ marketId: '10', marketName: 'Double Chance', specifier: '', status: 'open', outcomes: [] }, outcome, 'OVER15_MACHINE')).toBe(false);
  expect(systemConfig('OVER15_MACHINE')).toMatchObject({ riskMode: 'OVER15_MACHINE', numberOfSlips: 5, minimumOdds: 1.9, maximumOdds: 3.15 });
});

it('recognizes each provided market family and rejects unapproved or unavailable selections', () => {
  const names = ['Excluded Goals', 'Excluded Goals – Home', 'Excluded Goals – Away', 'Total Goal Kicks', 'Home Team Goal Kicks', 'Away Team Goal Kicks', 'Total Cards', 'Home Team Cards', 'Away Team Cards', 'Total Corners', 'Home Team Corners', 'Away Team Corners', 'Total Tackles', 'Home Team Tackles', 'Away Team Tackles', 'Total Goals', 'Home Team Goals', 'Away Team Goals', 'Double Chance'];
  for (const [index, marketName] of names.entries()) {
    const market = { marketId: index === 18 ? '10' : String(100 + index), marketName, specifier: '', status: 'open', outcomes: [] };
    const pick = { ...outcome, outcomeName: index < 3 ? '2' : index === 18 ? '1X' : 'Under 2.5' };
    expect(systemSelectionAllowed(market, pick), marketName).toBe(true);
  }
  expect(systemSelectionAllowed({ marketId: '139', marketName: 'Bookings Over/Under', specifier: 'total=3.5', status: 'open', outcomes: [] }, { ...outcome, outcomeName: 'Under 3.5' })).toBe(true);
  expect(systemSelectionAllowed({ marketId: '900300', marketName: 'Home Team Total Corners', specifier: 'total=4.5', status: 'open', outcomes: [] }, { ...outcome, outcomeName: 'Over 4.5' })).toBe(true);
  expect(systemSelectionAllowed({ marketId: '450004', marketName: 'Excluded Number of Goals', specifier: '', status: 'open', outcomes: [] }, { ...outcome, outcomeName: '1' })).toBe(true);
  for (const marketName of ['Both teams to score', 'Total shots', 'Home or Over 2.5', '1st half Total Cards', 'Player tackles']) {
    expect(systemSelectionAllowed({ marketId: '99', marketName, specifier: '', status: 'open', outcomes: [] }, { ...outcome, outcomeName: 'Under 2.5' })).toBe(false);
  }
  expect(systemFixture(fixture(1, false)).markets).toEqual([]);
  expect(systemSelectionAllowed(fixture(1).markets[0], { ...outcome, odds: 1.36 })).toBe(false);
  expect(systemSelectionAllowed(fixture(1).markets[0], { ...outcome, isActive: false })).toBe(false);
});

it('covers games beyond the first 100 from the provided-option listing and shares concurrent mode reads', async () => {
  const games = Array.from({ length: 350 }, (_, id) => fixture(id));
  games.push({ ...fixture(1000), kickoffAt: '2099-01-02T12:00:00Z' });
  const provider = { getFixtures: vi.fn(async (query: any) => query.eventIds ? query.eventIds.map((id: string) => games.find(g => g.eventId === id)) : games.slice((query.pageNum - 1) * 100, query.pageNum * 100)) };
  const loader = new SystemFixtureLoader(provider as any);
  const [investor, gambler] = await Promise.all([loader.load(window), loader.load(window)]);
  expect(investor.fixtures).toHaveLength(350);
  expect(gambler.fixtures).toEqual(investor.fixtures);
  expect(investor.fixtures.some(g => g.eventId === '349')).toBe(true);
  expect(investor.fixtures.some(g => g.eventId === '1000')).toBe(false);
  expect(investor.coverage.leagues).toBe(20);
  const calls = provider.getFixtures.mock.calls.length;
  await loader.load(window);
  expect(provider.getFixtures).toHaveBeenCalledTimes(calls);
  expect(provider.getFixtures.mock.calls.filter(([q]) => q.pageNum)).toHaveLength(4);
  expect(provider.getFixtures.mock.calls.every(([q]) => q.systemOnly && !q.eventIds)).toBe(true);
  expect(provider.getFixtures.mock.calls.find(([q]) => q.pageNum)?.[0].marketIds).toEqual(SYSTEM_LISTING_MARKET_IDS);
  expect(SYSTEM_LISTING_MARKET_IDS).toEqual(expect.arrayContaining(['10', '18', '19', '20', '139', '166', '167', '168', '450004', '900614', '900622']));
});

it('keeps listed approved options only and reports partial pages without hunting match boards', async () => {
  const listed = Array.from({ length: 100 }, (_, id) => fixture(id + 1, id !== 1));
  listed[1] = fixture(2, false);
  const provider = { getFixtures: vi.fn(async (query: any) => {
    if (query.eventIds) throw new Error('Match-board option hunting is not allowed');
    if (query.pageNum === 2) throw new Error('temporary listing failure');
    return query.pageNum === 1 ? listed : [];
  }) };
  const snapshot = await new SystemFixtureLoader(provider as any).load(window);
  expect(snapshot.coverage.listingFailures).toBe(1);
  expect(snapshot.coverage.detailGames).toBe(0);
  expect(snapshot.coverage.missingDetails).toBe(0);
  expect(snapshot.notices.join(' ')).toContain('partial');
  expect(snapshot.fixtures.map(g => g.eventId)).toContain('1');
  expect(snapshot.fixtures.map(g => g.eventId)).not.toContain('2');
  expect(snapshot.fixtures.every(g => g.markets.every(m => m.marketId === '10'))).toBe(true);
  expect(provider.getFixtures.mock.calls.every(([q]) => !q.eventIds)).toBe(true);
});

it.each(['INVESTOR', 'GAMBLER'] as const)('%s uses direct internal planning and day-wide games without LLM/catalog calls', async riskMode => {
  const games = Array.from({ length: 140 }, (_, id) => fixture(id));
  const bookmaker = { getFixtures: vi.fn(async (query: any) => query.eventIds ? query.eventIds.map((id: string) => games.find(g => g.eventId === id)) : games.slice((query.pageNum - 1) * 100, query.pageNum * 100)) };
  const config = systemConfig(riskMode);
  const selections = [{ eventId: '139', marketId: '10', outcomeId: '9', specifier: '', odds: 1.25 }];
  const ai = { modelInfo: vi.fn().mockResolvedValue({}), parse: vi.fn().mockRejectedValue(new Error('No instruction LLM allowed')), resolve: vi.fn().mockRejectedValue(new Error('No market catalog resolution allowed')),
    generate: vi.fn(async (fixtures, plan) => ({ pool: [], candidates: [{ selections, slipScore: 1 }], notices: [], needsExpansion: false, effectiveConfig: plan, diagnostics: { foundSlips: 1 } })) };
  const prisma = { generationJob: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'PENDING' }), update: vi.fn() }, slipGroup: { update: vi.fn() }, trainingEvent: { create: vi.fn() }, $transaction: (ops: unknown[]) => Promise.all(ops) };
  const service = new SlipsService(bookmaker as any, { cacheScores: vi.fn() } as any, ai as any,
    { validate: vi.fn().mockResolvedValue(selections) } as any, prisma as any, {} as any, {} as any);
  const result = await service.prepareGeneration({ jobId: 'j', groupId: 'g', riskMode, instruction: 'Create tickets', matchDate: '2099-01-01' });
  expect(result?.config).toMatchObject({ ...config, kickoffAfter: new Date(window.kickoffAfter).toISOString(), kickoffBefore: new Date(window.kickoffBefore).toISOString() });
  expect(ai.parse).not.toHaveBeenCalled(); expect(ai.resolve).not.toHaveBeenCalled(); expect(ai.modelInfo).not.toHaveBeenCalled();
  expect(ai.generate.mock.calls[0][0]).toHaveLength(140);
  expect(ai.generate.mock.calls[0][0].some((g: BookmakerFixture) => g.eventId === '139')).toBe(true);
  expect(bookmaker.getFixtures.mock.calls.every(([q]) => !q.eventIds)).toBe(true);
  expect(prisma.slipGroup.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ generationReport: expect.objectContaining({ fixtureCoverage: expect.objectContaining({ dayGames: 140, detailGames: 0 }) }) }) }));
});

it('OVER15_MACHINE plans five near-3 tickets from day-wide Over/Under listings', async () => {
  const games = Array.from({ length: 40 }, (_, id) => ({
    eventId: String(id), homeTeam: `Home ${id}`, awayTeam: `Away ${id}`, league: `League ${id % 5}`,
    categoryName: 'Football', kickoffAt: '2099-01-01T12:00:00Z', matchStatus: 'Not started',
    markets: [{ marketId: '18', marketName: 'Over/Under', specifier: 'total=1.5', status: 'active',
      outcomes: [{ outcomeId: '12', outcomeName: 'Over 1.5', odds: 1.18, isActive: true }] }],
  }));
  const bookmaker = { getFixtures: vi.fn(async (query: any) => query.pageNum === 1 ? games : []) };
  const selections = [{ eventId: '1', marketId: '18', outcomeId: '12', specifier: 'total=1.5', odds: 1.18 }];
  const ai = { modelInfo: vi.fn(), parse: vi.fn().mockRejectedValue(new Error('No instruction LLM allowed')), resolve: vi.fn().mockRejectedValue(new Error('No market catalog resolution allowed')),
    generate: vi.fn(async (_fixtures, plan) => ({ pool: [], candidates: [{ selections, slipScore: 1 }], notices: [], needsExpansion: false, effectiveConfig: plan, diagnostics: { foundSlips: 1 } })) };
  const prisma = { generationJob: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'PENDING' }), update: vi.fn() }, slipGroup: { update: vi.fn() }, trainingEvent: { create: vi.fn() }, $transaction: (ops: unknown[]) => Promise.all(ops) };
  const service = new SlipsService(bookmaker as any, { cacheScores: vi.fn() } as any, ai as any,
    { validate: vi.fn().mockResolvedValue(selections) } as any, prisma as any, {} as any, {} as any);
  const result = await service.prepareGeneration({ jobId: 'j', groupId: 'g', riskMode: 'OVER15_MACHINE', instruction: 'Create tickets', matchDate: '2099-01-01' });
  expect(result?.config).toMatchObject({ riskMode: 'OVER15_MACHINE', numberOfSlips: 5, minimumOdds: 1.9, maximumOdds: 3.15 });
  expect(ai.parse).not.toHaveBeenCalled();
  expect(ai.generate.mock.calls[0][0]).toHaveLength(40);
  expect(bookmaker.getFixtures.mock.calls.every(([q]) => q.systemMode === 'OVER15_MACHINE' && q.marketIds.includes('18'))).toBe(true);
});

it('drops live or optionless listing games without opening match boards', async () => {
  const games = [{ ...fixture(1), markets: [] }, { ...fixture(2), matchStatus: 'Live' }, fixture(3)];
  const provider = { getFixtures: vi.fn(async (query: any) => {
    if (query.eventIds) throw new Error('Match-board option hunting is not allowed');
    return query.pageNum === 1 ? games : [];
  }) };
  const snapshot = await new SystemFixtureLoader(provider as any).load(window);
  expect(snapshot.fixtures.map(g => g.eventId)).toEqual(['3']);
  expect(provider.getFixtures.mock.calls.every(([q]) => !q.eventIds)).toBe(true);
});

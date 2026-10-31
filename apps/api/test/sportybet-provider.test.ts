import { expect, it, vi } from 'vitest';
import { SportyBetProvider } from '../src/bookmaker/sportybet.provider';

it('fetches original events directly instead of relying on the first fixtures page', async () => {
  const client = { regionCode: 'ng', get: vi.fn().mockResolvedValue({ eventId: 'sr:match:1', homeTeamName: 'A', awayTeamName: 'B', estimateStartTime: Date.UTC(2099, 0, 1), markets: [] }) };
  const fixtures = await new SportyBetProvider(client as any).getFixtures({ eventIds: ['sr:match:1', 'sr:match:1'] });
  expect(fixtures).toHaveLength(1);
  expect(client.get).toHaveBeenCalledTimes(1);
  expect(client.get.mock.calls[0][0]).toContain('/factsCenter/event?eventId=sr%3Amatch%3A1');
});

it('reads a newly created booking when share POST returns only its code', async () => {
  const client = { regionCode: 'ng', post: vi.fn().mockResolvedValue({ shareCode: 'NEW123' }),
    get: vi.fn().mockResolvedValue({ shareCode: 'NEW123', outcomes: [{ eventId: '1', marketId: '1', outcomeId: '1', odds: 1.5 }] }) };
  const booking = await new SportyBetProvider(client as any).createBooking([{ eventId: '1', marketId: '1', outcomeId: '1', specifier: '' }]);
  expect(client.get.mock.calls[0][0]).toBe('/api/ng/orders/share/NEW123');
  expect(booking.selections[0].odds).toBe(1.5);
});

it('bypasses cached event data for an explicit result check', async () => {
  const client = { regionCode: 'ng', get: vi.fn().mockResolvedValue({
    eventId: 'event', estimateStartTime: Date.UTC(2026, 0, 1), matchStatus: 'Finished', setScore: '2:1',
  }) };
  const [fixture] = await new SportyBetProvider(client as any).getFixtures({ eventIds: ['event'], fresh: true });
  expect(client.get.mock.calls[0][1]).toEqual({ cacheKey: undefined });
  expect(fixture).toMatchObject({ matchStatus: 'Finished', score: '2 : 1' });
});

it('keeps only product-approved options when loading a fixed-mode board', async () => {
  const client = { regionCode: 'ng', get: vi.fn().mockResolvedValue({
    eventId: 'event', estimateStartTime: Date.UTC(2099, 0, 1), homeTeamName: 'A', awayTeamName: 'B', markets: [
      { id: '1', desc: '1X2', outcomes: [{ id: '1', desc: 'Home', odds: 1.2, isActive: 1 }] },
      { id: '10', desc: 'Double Chance', outcomes: [{ id: '9', desc: '1X', odds: 1.25, isActive: 1 }, { id: '11', desc: 'X2', odds: 1.8, isActive: 1 }] },
    ],
  }) };
  const [game] = await new SportyBetProvider(client as any).getFixtures({ eventIds: ['event'], systemOnly: true });
  expect(game.markets.map(m => m.marketId)).toEqual(['10']);
  expect(game.markets[0].outcomes.map(o => o.outcomeId)).toEqual(['9']);
});

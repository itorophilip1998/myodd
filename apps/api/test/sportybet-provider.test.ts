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

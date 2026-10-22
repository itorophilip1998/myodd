import { describe, expect, it, vi } from 'vitest';
import { codeExpiry, assessBooking, CODE_LIFETIME_MS } from '../src/catalog/catalog.policy';
import { CatalogService } from '../src/catalog/catalog.service';
const now = new Date('2026-10-17T00:00:00Z');
const booking: any = { deadline: null, selections: [1, 2].map(i => ({ eventId: String(i), odds: 1.5, isActive: true, kickoffAt: '2026-10-18T00:00:00Z' })) };
describe('catalog lifetime and active master policy', () => {
  it('caps reuse at seven days and respects earlier upstream expiry', () => {
    expect(codeExpiry(now).getTime()).toBe(now.getTime() + CODE_LIFETIME_MS);
    expect(codeExpiry(now, '2026-10-18T00:00:00Z').toISOString()).toBe('2026-10-18T00:00:00.000Z');
  });
  it('requires every pick active for display and distinguishes partial codes', () => {
    expect(assessBooking(booking, now, now).status).toBe('ACTIVE');
    expect(assessBooking({ ...booking, selections: [booking.selections[0], { ...booking.selections[1], isActive: false }] }, now, now).status).toBe('PARTIAL');
    expect(assessBooking(booking, now, new Date('2026-10-25')).status).toBe('EXPIRED');
  });
  it('never extends the original lifetime on rediscovery', async () => {
    const upsert = vi.fn().mockResolvedValue({ code: 'ABC123' });
    const service = new CatalogService({ bookingCode: { upsert } } as any, {} as any, {} as any, {} as any);
    await service.remember('abc123');
    expect(upsert.mock.calls[0][0].update).toEqual({ lastSeenAt: expect.any(Date) });
  });
  it('bypasses the cache before an active declaration', async () => {
    const getBooking = vi.fn().mockResolvedValue(booking);
    const update = vi.fn().mockResolvedValue({ status: 'ACTIVE' });
    const service = new CatalogService({ trainingEvent: { create: vi.fn() }, bookingCode: { findUniqueOrThrow: vi.fn().mockResolvedValue({ firstSeenAt: new Date(), expiresAt: new Date(Date.now() + CODE_LIFETIME_MS) }), update } } as any, {} as any, { getBooking } as any, {} as any);
    await service.validate('ABC123');
    expect(getBooking).toHaveBeenCalledWith('ABC123', { fresh: true });
  });
});

it('keeps the original expiry when SportyBet returns a previously saved code', async () => {
  const { SlipsService } = await import('../src/slips/slips.service');
  const firstSeenAt = new Date(Date.now() - 6 * 86400000);
  const create = vi.fn();
  const tx = { slipGroup: { updateMany: vi.fn() }, trainingEvent: { create: vi.fn() }, generationJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'job', total: 1, progress: 1, failedCount: 0 }), update: vi.fn() },
    generatedSlip: { create }, bookingCode: { findUnique: vi.fn().mockResolvedValue({ firstSeenAt }), upsert: vi.fn() } };
  const prisma = { $transaction: (fn: any) => fn(tx) };
  const service = new SlipsService({} as any, {} as any, {} as any, {} as any, prisma as any, {} as any, {} as any);
  const picks: any[] = [{ eventId: '1', marketId: '1', outcomeId: '1', odds: 1.5, confidence: 60, probability: .6, modelVersion: 'odds-v2' }];
  await service.settleBooking('task', { jobId: 'job', groupId: 'group', config: {} as any, selections: picks }, { ...booking, code: 'SAME123', shareUrl: 'https://www.sportybet.com/ng/?shareCode=SAME123' }, picks);
  expect(create.mock.calls[0][0].data.expiresAt).toEqual(codeExpiry(firstSeenAt));
});

it('keeps last-known-active codes visible while rechecking stale snapshots', async () => {
  const firstSeenAt = new Date();
  const snapshot = { ...booking, selections: booking.selections.map((s: any) => ({ ...s, kickoffAt: '2099-01-01T00:00:00Z' })) };
  const row = { firstSeenAt, checkedAt: new Date(), expiresAt: codeExpiry(firstSeenAt), snapshot, status: 'ACTIVE' };
  const queue = { add: vi.fn() };
  const service = new CatalogService({ bookingCode: { findMany: vi.fn().mockResolvedValue([
    { ...row, code: 'FRESH1' }, { ...row, code: 'STALE1', checkedAt: new Date(Date.now() - 120000) },
    { ...row, code: 'PARTLY', status: 'PARTIAL' }, { ...row, code: 'OLD123', expiresAt: new Date(0) },
  ]) } } as any, {} as any, {} as any, queue as any);
  const result = await service.displayStatus(['FRESH1', 'STALE1', 'PARTLY', 'OLD123']);
  expect([...result.valid].sort()).toEqual(['FRESH1', 'STALE1']);
  expect(result.statuses.get('STALE1')).toBe('CHECKING');
  expect(result.checking).toBe(1);
  expect(result.statuses.get('PARTLY')).toBe('PARTIAL');
  expect(result.unavailable).toBe(1);
  expect(queue.add).toHaveBeenCalledTimes(1);
});

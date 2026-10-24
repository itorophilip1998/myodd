import { describe, expect, it, vi } from 'vitest';
import { generationConfigSchema } from '@myodd/shared';
import { SlipsService } from '../src/slips/slips.service';
import { ApiError } from '../../web/src/lib/api';
import { freshestResultJob, permanentResultError, resultReadInterval, retryResultRead } from '../../web/src/lib/result-recovery';

function setup() {
  const kickoffAt = new Date(Date.now() + 3600000).toISOString();
  const picks = [1, 2].map(n => ({ eventId: String(n), marketId: '1', outcomeId: '1', specifier: '', odds: 1.5, kickoffAt }));
  const fixtures = picks.map(pick => ({ eventId: pick.eventId, kickoffAt, markets: [] }));
  const bookmaker = { getFixtures: vi.fn().mockResolvedValue(fixtures), getBooking: vi.fn().mockResolvedValue({ code: 'SOURCE123', selections: picks }), createBooking: vi.fn() };
  const catalog = { master: vi.fn().mockResolvedValue({ code: 'STALE', booking: { selections: [] } }), remember: vi.fn() };
  const prisma = { generationJob: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'PENDING' }), update: vi.fn().mockResolvedValue({}) }, slipGroup: { update: vi.fn().mockResolvedValue({}) }, trainingEvent: { create: vi.fn().mockResolvedValue({}) }, $transaction: (values: unknown[]) => Promise.all(values) };
  const ai = { modelInfo: vi.fn().mockResolvedValue({}), parse: vi.fn().mockResolvedValue(generationConfigSchema.parse({ fixtureMode: 'original_only', preserveOriginalSelections: true })), generate: vi.fn().mockImplementation(async (_fixtures, config) => ({ effectiveConfig: config, notices: [], needsExpansion: false, pool: [], candidates: [{ selections: picks, slipScore: 1 }], diagnostics: {} })) };
  const validator = { validate: vi.fn().mockResolvedValue(picks) };
  const service = new SlipsService(bookmaker as any, { cacheScores: vi.fn() } as any, ai as any, validator as any, prisma as any, catalog as any, {} as any);
  return { service, ai, bookmaker, catalog, picks };
}
describe('generation source recovery', () => {
  it('builds fresh prompts from upcoming fixtures, never from an implicit master', async () => {
    const { service, ai, bookmaker, catalog } = setup();
    const plan = await service.prepareGeneration({ jobId: 'job', groupId: 'group', instruction: 'Create two tickets', userId: 'owner' });
    expect(catalog.master).not.toHaveBeenCalled(); expect(bookmaker.getBooking).not.toHaveBeenCalled();
    expect(bookmaker.getFixtures).toHaveBeenCalledWith(expect.objectContaining({ pageNum: 1 }));
    expect(ai.generate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ fixtureMode: 'upcoming', preserveOriginalSelections: false }), undefined);
    expect(plan?.candidates).toHaveLength(1); expect(bookmaker.createBooking).not.toHaveBeenCalled();
  });
  it('preserves explicit source selections and constraints without replacing them with upcoming matches', async () => {
    const { service, ai, bookmaker, picks } = setup();
    await service.prepareGeneration({ jobId: 'job', groupId: 'group', instruction: 'Use original matches', bookingCode: 'SOURCE123', userId: 'owner' });
    expect(bookmaker.getBooking).toHaveBeenCalledWith('SOURCE123', { fresh: true });
    expect(ai.generate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ fixtureMode: 'original_only', preserveOriginalSelections: true }), picks);
    expect(bookmaker.getFixtures).not.toHaveBeenCalledWith(expect.objectContaining({ pageNum: 1 }));
  });
  it('requests a missing explicit source before creating a job', async () => {
    const { service, bookmaker } = setup();
    await expect(service.startGeneration({ instruction: 'Only use original matches' })).rejects.toThrow('Paste a source booking code');
    expect(bookmaker.getFixtures).not.toHaveBeenCalled(); expect(bookmaker.createBooking).not.toHaveBeenCalled();
  });
});
describe('safe result read recovery', () => {
  it('retries temporary disconnections but stops unauthorized and deleted-link reads', () => {
    for (const status of [0, 429, 500, 502, 503]) {
      const error = new ApiError('temporary', status);
      expect(retryResultRead(0, error)).toBe(true); expect(resultReadInterval(error, 8)).toBe(15000);
    }
    for (const status of [401, 403, 404, 410]) {
      const error = new ApiError('unavailable', status);
      expect(permanentResultError(error)).toBe(true); expect(retryResultRead(0, error)).toBe(false); expect(resultReadInterval(error)).toBe(false);
    }
    expect(retryResultRead(2, new ApiError('temporary', 500))).toBe(false);
  });
  it('uses the newer embedded job when the separate job read is stale', () => {
    const job: any = { status: 'RUNNING', updatedAt: '2026-10-23T10:00:00Z' };
    const embedded: any = { status: 'COMPLETED', updatedAt: '2026-10-23T10:00:01Z' };
    expect(freshestResultJob(job, embedded)).toBe(embedded); expect(freshestResultJob(undefined, embedded)).toBe(embedded);
  });
});

it('preserves typed missing-source errors through the HTTP boundary', async () => {
  const { BadRequestException } = await import('@nestjs/common');
  const { AppExceptionFilter } = await import('../src/common/http-exception.filter');
  const response: any = { status: vi.fn(), json: vi.fn() }; response.status.mockReturnValue(response);
  new AppExceptionFilter().catch(new BadRequestException({ code: 'SOURCE_REQUIRED', message: 'Paste a source booking code to reuse its original matches.' }), { switchToHttp: () => ({ getResponse: () => response }) } as any);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SOURCE_REQUIRED', statusCode: 400 }));
});

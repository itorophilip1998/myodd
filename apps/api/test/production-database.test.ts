import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SlipsService } from '../src/slips/slips.service';
import { AccountController } from '../src/auth/account.controller';
import { CollectionCleanup } from '../src/groups/collection-cleanup';

const url = process.env.TEST_DATABASE_URL;
// This suite must never run against application/production databases.
if (url && new URL(url).pathname !== '/myodd_test') throw new Error('Database integration tests require a disposable database named myodd_test');
describe.skipIf(!url)('production improvements against PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused:unused@127.0.0.1:1/myodd_test' } } });
  const prefix = `integration-${randomUUID()}`;
  let owner: { id: string }; let other: { id: string };
  const groupIds: string[] = [];
  beforeAll(async () => {
    owner = await db.appUser.create({ data: { clerkId: `${prefix}-owner` } });
    other = await db.appUser.create({ data: { clerkId: `${prefix}-other` } });
  });
  afterAll(async () => {
    await db.generationJob.deleteMany({ where: { groupId: { in: groupIds } } });
    await db.slipGroup.deleteMany({ where: { id: { in: groupIds } } });
    await db.trainingEvent.deleteMany({ where: { OR: [{ groupId: { in: groupIds } }, { profileId: { in: [owner.id, other.id] } }, { kind: 'COLLECTION_EXPIRED', payload: { path: ['groupId'], string_starts_with: prefix } }] } });
    await db.appUser.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await db.$disconnect(); vi.unstubAllEnvs();
  });
  it('deduplicates concurrent requests and rejects payload changes', async () => {
    const service = new SlipsService({} as any, {} as any, {} as any, {} as any, db as any, {} as any, { add: vi.fn() } as any);
    const request = { userId: owner.id, requestId: randomUUID(), instruction: 'Generate 10 weekend tickets' };
    const [a, b] = await Promise.all([service.startGeneration(request), service.startGeneration(request)]);
    groupIds.push(a.groupId);
    expect(a).toEqual(b);
    expect(await db.slipGroup.count({ where: { id: a.groupId } })).toBe(1);
    expect(await db.generationJob.count({ where: { groupId: a.groupId } })).toBe(1);
    await expect(service.startGeneration({ ...request, instruction: 'Generate 20 tickets' })).rejects.toThrow('different settings');
  });
  it('saves title and visibility on the existing group and prevents another owner claiming it', async () => {
    const group = await db.slipGroup.create({ data: { publicId: `${prefix}-save`, title: 'Draft', ownerId: owner.id } }); groupIds.push(group.id);
    const controller = new AccountController(db as any);
    await controller.save(group.publicId, { account: owner } as any, { title: ' Weekend\u0000 Picks ', isPublic: true });
    await controller.save(group.publicId, { account: owner } as any, { title: 'Weekend Picks', isPublic: true });
    expect(await db.slipGroup.findUnique({ where: { id: group.id } })).toMatchObject({ title: 'Weekend Picks', isPublic: true, userSaved: true, ownerId: owner.id });
    expect(await db.savedCollection.count({ where: { groupId: group.id } })).toBe(1);
    await expect(controller.save(group.publicId, { account: other } as any, { isPublic: false })).rejects.toThrow('not found');
  });
  it('allows exactly one concurrent account to claim a guest draft', async () => {
    const group = await db.slipGroup.create({ data: { publicId: `${prefix}-claim`, title: 'Guest draft' } }); groupIds.push(group.id);
    const controller = new AccountController(db as any);
    const results = await Promise.allSettled([controller.save(group.publicId, { account: owner } as any), controller.save(group.publicId, { account: other } as any)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.savedCollection.count({ where: { groupId: group.id } })).toBe(1);
  });
  it('merges concurrent settings patches without leaking another account preferences', async () => {
    const controller = new AccountController(db as any);
    await Promise.all([controller.updateSettings({ account: owner } as any, { soundsEnabled: false }), controller.updateSettings({ account: owner } as any, { soundVolume: .2 })]);
    expect((await controller.settings({ account: owner } as any)).settings).toMatchObject({ soundsEnabled: false, soundVolume: .2 });
    expect((await controller.settings({ account: other } as any)).settings).toBeNull();
  });
  it('keeps a successful authenticated ticket as a private draft and settles its task once', async () => {
    const group = await db.slipGroup.create({ data: { publicId: `${prefix}-autosave`, title: 'Generated result', ownerId: owner.id } }); groupIds.push(group.id);
    const job = await db.generationJob.create({ data: { groupId: group.id, total: 1, requestedCount: 1 } });
    const service = new SlipsService({} as any, {} as any, {} as any, {} as any, db as any, {} as any, {} as any);
    const picks: any[] = [{ eventId: 'test-event', marketId: '1', outcomeId: '1', specifier: '', homeTeam: 'Test A', awayTeam: 'Test B', league: 'Test', marketName: '1X2', selectionName: 'Home', odds: 2, confidence: .5, probability: .5, modelVersion: 'test', kickoffAt: '2099-01-01T00:00:00Z' }];
    const booking: any = { code: `${prefix.slice(0, 12)}AUTO`, shareUrl: 'https://example.invalid', deadline: null, unavailableOutcomes: [], selections: picks };
    const input: any = { jobId: job.id, groupId: group.id, config: {}, selections: picks };
    await service.settleBooking('test-task', input, booking, picks);
    await service.settleBooking('test-task', input, booking, picks);
    expect(await db.slipGroup.findUnique({ where: { id: group.id } })).toMatchObject({ userSaved: false, isPublic: false });
    expect(await db.generatedSlip.count({ where: { groupId: group.id } })).toBe(1);
    expect(await db.generationJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'COMPLETED', progress: 1 });
    await db.bookingCode.deleteMany({ where: { code: booking.code.toUpperCase() } });
  });
  async function completedGroup(suffix: string, result: 'WON' | 'UNKNOWN' = 'WON') {
    const past = new Date(Date.now() - 25 * 3600_000);
    const group = await db.slipGroup.create({ data: {
      id: `${prefix}-${suffix}`, publicId: `${prefix}-${suffix}`, title: 'Completed test', ownerId: owner.id, userSaved: true, isPublic: true,
      completedAt: past, deleteAfter: new Date(past.getTime() + 86400_000),
      jobs: { create: { status: 'COMPLETED' } }, savedBy: { create: [{ userId: owner.id }, { userId: other.id }] },
      slips: { create: { bookingCode: 'TESTONLY', shareUrl: 'https://example.invalid', totalOdds: 2, confidence: .5, riskLevel: 'LOWER', selectionCount: 1, fingerprint: suffix,
        selections: { create: { sportyEventId: 'test-event', marketId: '1', outcomeId: '1', homeTeam: 'Test A', awayTeam: 'Test B', league: 'Test league', marketName: '1X2', selectionName: 'Home', odds: 2, predictionProbability: .5, predictionScore: .5,
          result, matchPhase: 'finished', resultCheckedAt: new Date(), matchCheckedAt: new Date(), resultEvidence: { source: 'test' } } } } },
    } }); groupIds.push(group.id); return group;
  }
  it('physically deletes only eligible fully settled collections and dependent rows', async () => {
    const complete = await completedGroup('complete');
    const unsettled = await completedGroup('unsettled', 'UNKNOWN');
    await db.trainingEvent.create({ data: { kind: 'TEST_AUDIT', groupId: complete.id, payload: {} } });
    const checks = { checkSlips: async (ids: string[]) => { await db.slipSelection.updateMany({ where: { slipId: { in: ids } }, data: { matchCheckedAt: new Date(), resultCheckedAt: new Date() } }); } };
    vi.stubEnv('COLLECTION_CLEANUP_ENABLED', 'true');
    const worker = new CollectionCleanup(db as any, checks as any);
    expect((await worker.process()).deleted).toBe(1);
    expect(await db.slipGroup.findUnique({ where: { id: complete.id } })).toBeNull();
    expect(await db.savedCollection.count({ where: { groupId: complete.id } })).toBe(0);
    expect(await db.generatedSlip.count({ where: { groupId: complete.id } })).toBe(0);
    expect(await db.generationJob.count({ where: { groupId: complete.id } })).toBe(0);
    expect(await db.trainingEvent.count({ where: { groupId: complete.id, kind: 'TEST_AUDIT' } })).toBe(1);
    expect(await db.slipGroup.findUnique({ where: { id: unsettled.id } })).toMatchObject({ completedAt: null, deleteAfter: null });
    expect((await worker.process()).deleted).toBe(0);
  });
  it('defers deletion when fresh verification fails or reopens a match', async () => {
    const group = await completedGroup('correction');
    const worker = new CollectionCleanup(db as any, { checkSlips: vi.fn().mockRejectedValue(new Error('outage')) } as any);
    await worker.process();
    expect(await db.slipGroup.findUnique({ where: { id: group.id } })).not.toBeNull();
    const correction = new CollectionCleanup(db as any, { checkSlips: async (ids: string[]) => { await db.slipSelection.updateMany({ where: { slipId: { in: ids } }, data: { result: 'PENDING', matchPhase: 'live', matchCheckedAt: new Date() } }); } } as any);
    await correction.process();
    expect(await db.slipGroup.findUnique({ where: { id: group.id } })).toMatchObject({ completedAt: null, deleteAfter: null });
  });
});

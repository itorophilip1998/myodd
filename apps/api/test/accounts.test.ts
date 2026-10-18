import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { GroupsService } from '../src/groups/groups.service';
import { AccountController } from '../src/auth/account.controller';
const withTx = (db: any) => ({ ...db, $transaction: (work: any) => work(db) });
const sdk = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('@clerk/backend', () => ({ createClerkClient: () => ({ authenticateRequest: sdk.authenticate }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('Clerk identity boundary', () => {
  it('never creates an account for an anonymous request', async () => {
    const upsert = vi.fn();
    expect(await new AuthService({ appUser: { upsert } } as any).authenticate()).toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('derives the local account only from an authenticated Clerk session', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'test-secret');
    vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000');
    sdk.authenticate.mockResolvedValue({ isAuthenticated: true, toAuth: () => ({ userId: 'user_verified' }) });
    const upsert = vi.fn().mockResolvedValue({ id: 'local-verified', clerkId: 'user_verified' });
    const account = await new AuthService({ appUser: { upsert } } as any).authenticate('Bearer session-token');
    expect(account.id).toBe('local-verified');
    expect(upsert.mock.calls[0][0].where).toEqual({ clerkId: 'user_verified' });
    expect(sdk.authenticate.mock.calls[0][1]).toEqual({ authorizedParties: ['http://localhost:3000'], acceptsToken: 'session_token' });
  });
  it('rejects forged, expired or signed-out sessions without saving an account', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'test-secret');
    sdk.authenticate.mockResolvedValue({ isAuthenticated: false, toAuth: () => ({ userId: 'spoofed' }) });
    const upsert = vi.fn();
    await expect(new AuthService({ appUser: { upsert } } as any).authenticate('Bearer forged')).rejects.toThrow('invalid or expired');
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('account-scoped saved collections', () => {
  const privateSaved = { id: 'g', publicId: 'PRIVATE', isPublic: false, userSaved: true, ownerId: 'owner', deletedAt: null, slips: [] };
  const draft = { id: 'd', publicId: 'DRAFT', isPublic: false, userSaved: false, ownerId: 'owner', deletedAt: null, createdAt: new Date(), title: 'Draft', description: null, expiresAt: null, originalBookingCode: null, generationReport: null, slips: [], jobs: [], owner: null };
  const playCheck = { summarize: vi.fn().mockReturnValue({ tickets: 0, open: 0, live: 0, done: 0, cut: 0, allPlayed: 0, unknown: 0, legsOpen: 0, legsLive: 0, legsDone: 0, legsPlayed: 0, legsCut: 0 }) };
  it('rejects another account reading a saved private collection before checking any codes', async () => {
    const displayStatus = vi.fn();
    const service = new GroupsService({ slipGroup: { findUnique: vi.fn().mockResolvedValue(privateSaved) } } as any, { displayStatus } as any, playCheck as any);
    await expect(service.getByPublicId('PRIVATE', 'other')).rejects.toThrow('Collection not found');
    await expect(service.getByPublicId('PRIVATE')).rejects.toThrow('Collection not found');
    expect(displayStatus).not.toHaveBeenCalled();
  });
  it('keeps unsaved draft collections reachable by publicId without adding them to history', async () => {
    const displayStatus = vi.fn().mockResolvedValue({ valid: new Set(), checking: 0, unavailable: 0, statuses: new Map() });
    const service = new GroupsService({
      slipGroup: { findUnique: vi.fn().mockResolvedValue(draft) },
      savedCollection: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any, { displayStatus } as any, playCheck as any);
    await expect(service.getByPublicId('DRAFT')).resolves.toMatchObject({ publicId: 'DRAFT', userSaved: false, saved: false });
    expect(displayStatus).toHaveBeenCalled();
  });
  it('only includes owned, explicitly saved collections in history', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new GroupsService({ slipGroup: { findMany } } as any, {} as any, playCheck as any).listRecent(1, 'owner');
    expect(findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      userSaved: true,
      ownerId: 'owner',
      savedBy: { none: { userId: 'owner', hiddenAt: { not: null } } },
    });
  });
  it('prevents someone else from making a private collection public', async () => {
    const update = vi.fn();
    const service = new GroupsService({ slipGroup: { findUnique: vi.fn().mockResolvedValue(privateSaved), update } } as any, {} as any, playCheck as any);
    await expect(service.publish('PRIVATE', 'other')).rejects.toThrow('Collection not found');
    expect(update).not.toHaveBeenCalled();
    await expect(service.publish('PRIVATE', 'owner')).resolves.toMatchObject({ isPublic: true, userSaved: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'g' },
      data: { isPublic: true, userSaved: true, ownerId: 'owner', deletedAt: null },
    });
  });
  it('makes save operations idempotent and marks the draft as user-saved', async () => {
    const upsert = vi.fn();
    const update = vi.fn();
    const create = vi.fn();
    const controller = new AccountController(withTx({
      slipGroup: { findFirst: vi.fn().mockResolvedValue({ id: 'g', isPublic: false, userSaved: false, ownerId: null }), update },
      savedCollection: { upsert },
      trainingEvent: { create },
    }) as any);
    await controller.save('DRAFT', { account: { id: 'verified' } } as any);
    expect(update).toHaveBeenCalledWith({ where: { id: 'g' }, data: { userSaved: true, deletedAt: null, ownerId: 'verified' } });
    expect(upsert.mock.calls[0][0].create).toEqual({ userId: 'verified', groupId: 'g' });
    expect(upsert.mock.calls[0][0].where).toEqual({ userId_groupId: { userId: 'verified', groupId: 'g' } });
  });
  it('does not bookmark a private collection that is inaccessible to the account', async () => {
    const upsert = vi.fn();
    const controller = new AccountController({ slipGroup: { findFirst: vi.fn().mockResolvedValue(null) }, savedCollection: { upsert } } as any);
    await expect(controller.save('PRIVATE', { account: { id: 'other' } } as any)).rejects.toThrow('Collection not found');
    expect(upsert).not.toHaveBeenCalled();
  });
});


describe('collection library permissions and reversible removal', () => {
  it('only lists public collections that were explicitly saved and contain slips', async () => {
    const findMany = vi.fn().mockResolvedValue([{ publicId: 'PUBLIC', title: 'Public group', createdAt: new Date(), ownerId: 'other', owner: null, savedBy: [], _count: { slips: 3 } }]);
    const rows = await new GroupsService({ slipGroup: { findMany } } as any, {} as any, {} as any).listPublic(1, 'viewer');
    expect(findMany.mock.calls[0][0].where).toMatchObject({ isPublic: true, userSaved: true, deletedAt: null, slips: { some: {} } });
    expect(rows[0]).toMatchObject({ saved: false, isPublic: true, isOwner: false, slipCount: 3 });
    expect(rows[0]).not.toHaveProperty('ownerId');
  });
  it('only deletes collections owned by the authenticated account', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'g', publicId: 'MINE', ownerId: 'verified' }]);
    const upsert = vi.fn(); const create = vi.fn(); const update = vi.fn();
    const tx = { slipGroup: { findMany, update }, savedCollection: { upsert }, trainingEvent: { create } };
    const controller = new AccountController({ $transaction: (work: any) => work(tx) } as any);
    const result = await controller.remove({ publicIds: ['MINE', 'OTHER', 'MINE'] }, { account: { id: 'verified' } } as any);
    expect(findMany.mock.calls[0][0].where).toEqual({ publicId: { in: ['MINE', 'OTHER'] }, ownerId: 'verified' });
    expect(result).toEqual({ removed: ['MINE'] });
    expect(update).toHaveBeenCalledWith({ where: { id: 'g' }, data: { deletedAt: expect.any(Date), isPublic: false } });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.kind).toBe('COLLECTIONS_REMOVED');
  });
  it('rejects an oversized bulk removal before any database work', async () => {
    const transaction = vi.fn();
    const controller = new AccountController({ $transaction: transaction } as any);
    await expect(controller.remove({ publicIds: Array(101).fill('x') }, { account: { id: 'viewer' } } as any)).rejects.toThrow('Select 1–100');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('restores a previously removed collection when saved again', async () => {
    const upsert = vi.fn();
    const update = vi.fn();
    const create = vi.fn();
    const controller = new AccountController(withTx({
      slipGroup: { findFirst: vi.fn().mockResolvedValue({ id: 'g', ownerId: 'owner' }), update },
      savedCollection: { upsert },
      trainingEvent: { create },
    }) as any);
    await controller.save('MINE', { account: { id: 'owner' } } as any);
    expect(upsert.mock.calls[0][0].update).toEqual({ hiddenAt: null });
    expect(update).toHaveBeenCalledWith({ where: { id: 'g' }, data: { userSaved: true, deletedAt: null } });
  });
});

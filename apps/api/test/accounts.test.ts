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
  const privateGroup = { id: 'g', publicId: 'PRIVATE', isPublic: false, ownerId: 'owner', slips: [] };
  it('rejects another account reading a private collection before checking any codes', async () => {
    const displayStatus = vi.fn();
    const service = new GroupsService({ slipGroup: { findUnique: vi.fn().mockResolvedValue(privateGroup) } } as any, { displayStatus } as any);
    await expect(service.getByPublicId('PRIVATE', 'other')).rejects.toThrow('Collection not found');
    await expect(service.getByPublicId('PRIVATE')).rejects.toThrow('Collection not found');
    expect(displayStatus).not.toHaveBeenCalled();
  });
  it('only includes owned collections or publicly shared account bookmarks in history', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new GroupsService({ slipGroup: { findMany } } as any, {} as any).listRecent(1, 'owner');
    expect(findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, OR: [{ ownerId: 'owner', savedBy: { none: { userId: 'owner', hiddenAt: { not: null } } } }, { isPublic: true, savedBy: { some: { userId: 'owner', hiddenAt: null } } }] });
  });
  it('prevents someone else from making a private collection public', async () => {
    const update = vi.fn();
    const service = new GroupsService({ slipGroup: { findUnique: vi.fn().mockResolvedValue(privateGroup), update } } as any, {} as any);
    await expect(service.publish('PRIVATE', 'other')).rejects.toThrow('Collection not found');
    expect(update).not.toHaveBeenCalled();
    await expect(service.publish('PRIVATE', 'owner')).resolves.toMatchObject({ isPublic: true });
    expect(update).toHaveBeenCalledWith({ where: { id: 'g', ownerId: 'owner' }, data: { isPublic: true } });
  });
  it('makes save operations idempotent and binds them to the verified account', async () => {
    const upsert = vi.fn();
    const controller = new AccountController(withTx({ slipGroup: { findFirst: vi.fn().mockResolvedValue({ id: 'g', isPublic: true }) }, savedCollection: { upsert } }) as any);
    await controller.save('PUBLIC', { account: { id: 'verified' } } as any);
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
  it('only lists public collections that contain saved slips', async () => {
    const findMany = vi.fn().mockResolvedValue([{ publicId: 'PUBLIC', title: 'Public group', createdAt: new Date(), ownerId: 'other', savedBy: [], _count: { slips: 3 } }]);
    const rows = await new GroupsService({ slipGroup: { findMany } } as any, {} as any).listPublic(1, 'viewer');
    expect(findMany.mock.calls[0][0].where).toEqual({ isPublic: true, deletedAt: null, slips: { some: {} } });
    expect(rows[0]).toMatchObject({ saved: false, isPublic: true, isOwner: false, slipCount: 3 });
    expect(rows[0]).not.toHaveProperty('ownerId');
  });
  it('only hides collections owned or bookmarked by the authenticated account', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'g', publicId: 'MINE' }]);
    const upsert = vi.fn(); const create = vi.fn();
    const tx = { slipGroup: { findMany }, savedCollection: { upsert }, trainingEvent: { create } };
    const controller = new AccountController({ $transaction: (work: any) => work(tx) } as any);
    const result = await controller.remove({ publicIds: ['MINE', 'OTHER', 'MINE'] }, { account: { id: 'verified' } } as any);
    expect(findMany.mock.calls[0][0].where).toEqual({ publicId: { in: ['MINE', 'OTHER'] }, OR: [{ ownerId: 'verified' }, { isPublic: true, deletedAt: null, savedBy: { some: { userId: 'verified', hiddenAt: null } } }] });
    expect(result).toEqual({ removed: ['MINE'] });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create).toMatchObject({ userId: 'verified', groupId: 'g', hiddenAt: expect.any(Date) });
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
    const controller = new AccountController(withTx({ slipGroup: { findFirst: vi.fn().mockResolvedValue({ id: 'g' }) }, savedCollection: { upsert } }) as any);
    await controller.save('MINE', { account: { id: 'owner' } } as any);
    expect(upsert.mock.calls[0][0].update).toEqual({ hiddenAt: null });
  });
});

describe('bulk public collection saves', () => {
  it('only adds public collections created by someone else, using the verified account', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'g', publicId: 'PUBLIC' }]); const upsert = vi.fn(); const create = vi.fn();
    const tx = { slipGroup: { findMany }, savedCollection: { upsert }, trainingEvent: { create } };
    const controller = new AccountController({ $transaction: (work: any) => work(tx) } as any);
    expect(await controller.saveSelected({ publicIds: ['PUBLIC', 'PRIVATE', 'PUBLIC'] }, { account: { id: 'viewer' } } as any)).toEqual({ saved: ['PUBLIC'] });
    expect(findMany.mock.calls[0][0].where).toEqual({ publicId: { in: ['PUBLIC', 'PRIVATE'] }, isPublic: true, deletedAt: null, OR: [{ ownerId: null }, { ownerId: { not: 'viewer' } }] });
    expect(upsert.mock.calls[0][0].create).toEqual({ userId: 'viewer', groupId: 'g' });
    expect(upsert.mock.calls[0][0].update).toEqual({ hiddenAt: null });
    expect(create.mock.calls[0][0].data.kind).toBe('PUBLIC_COLLECTIONS_SAVED');
  });
  it('rejects empty or oversized batches before database access', async () => {
    const transaction = vi.fn(); const controller = new AccountController({ $transaction: transaction } as any);
    for (const publicIds of [[], Array(101).fill('x')]) await expect(controller.saveSelected({ publicIds }, { account: { id: 'viewer' } } as any)).rejects.toThrow('Select 1–100');
    expect(transaction).not.toHaveBeenCalled();
  });
});

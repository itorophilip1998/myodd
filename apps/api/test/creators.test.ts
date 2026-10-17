import { describe, expect, it, vi } from 'vitest';
import { CreatorsService } from '../src/creators/creators.service';
import { GroupsService } from '../src/groups/groups.service';
import { AccountController } from '../src/auth/account.controller';
describe('public creator monitoring', () => {
  it('binds follows to the verified viewer and makes repeat follows idempotent', async () => {
    const upsert = vi.fn(); const service = new CreatorsService({ appUser: { findUnique: vi.fn().mockResolvedValue({ id: 'creator' }) }, creatorFollow: { upsert } } as any);
    await service.follow('public-handle', 'viewer');
    expect(upsert.mock.calls[0][0]).toEqual({ where: { followerId_creatorId: { followerId: 'viewer', creatorId: 'creator' } }, create: { followerId: 'viewer', creatorId: 'creator' }, update: {} });
  });
  it('prevents self-monitoring and never writes a follow for a missing creator', async () => {
    const upsert = vi.fn(); const findUnique = vi.fn().mockResolvedValueOnce({ id: 'viewer' }).mockResolvedValueOnce(null);
    const service = new CreatorsService({ appUser: { findUnique }, creatorFollow: { upsert } } as any);
    await expect(service.follow('self', 'viewer')).rejects.toThrow('cannot monitor yourself');
    await expect(service.follow('missing', 'viewer')).rejects.toThrow('Creator not found');
    expect(upsert).not.toHaveBeenCalled();
  });
  it('only removes the current viewer’s monitoring relationship', async () => {
    const deleteMany = vi.fn(); const service = new CreatorsService({ appUser: { findUnique: vi.fn().mockResolvedValue({ id: 'creator' }) }, creatorFollow: { deleteMany } } as any);
    await service.unfollow('public', 'viewer'); expect(deleteMany).toHaveBeenCalledWith({ where: { followerId: 'viewer', creatorId: 'creator' } });
  });
  it('only exposes public creator metadata, without Clerk identity or account fields', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'internal', publicId: 'public', username: 'picks', followers: [], _count: { groups: 2, followers: 3 } }]);
    const rows = await new CreatorsService({ appUser: { findMany } } as any).discover('', 1, 'viewer');
    expect(rows[0]).toEqual({ publicId: 'public', username: 'picks', name: '@picks', following: false, isSelf: false, publicCollections: 2, followerCount: 3 });
    expect(findMany.mock.calls[0][0].where.groups.some).toMatchObject({ isPublic: true, deletedAt: null });
  });
  it('keeps deleted/private collections out of followed creators’ feed', async () => {
    const findMany = vi.fn().mockResolvedValue([]); await new GroupsService({ slipGroup: { findMany } } as any, {} as any).listPublic(1, 'viewer', undefined, true);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ isPublic: true, deletedAt: null, owner: { followers: { some: { followerId: 'viewer' } } } });
  });
});
describe('owner collection management', () => {
  it('rejects editing someone else’s collection before any update', async () => {
    const update = vi.fn(); const tx = { slipGroup: { findFirst: vi.fn().mockResolvedValue(null), update } };
    const svc = new GroupsService({ $transaction: (work: any) => work(tx) } as any, {} as any);
    await expect(svc.edit('public', 'not-owner', { isPublic: false })).rejects.toThrow('Collection not found'); expect(update).not.toHaveBeenCalled();
  });
  it('saves owner privacy changes and their audit event in one transaction', async () => {
    const update = vi.fn().mockResolvedValue({ publicId: 'public', title: 'Renamed', isPublic: false }); const create = vi.fn();
    const findFirst = vi.fn().mockResolvedValue({ id: 'g' }); const tx = { slipGroup: { findFirst, update }, trainingEvent: { create } };
    await new GroupsService({ $transaction: (work: any) => work(tx) } as any, {} as any).edit('public', 'owner', { title: 'Renamed', isPublic: false });
    expect(findFirst).toHaveBeenCalledWith({ where: { publicId: 'public', ownerId: 'owner', deletedAt: null } });
    expect(update.mock.calls[0][0].data).toEqual({ title: 'Renamed', isPublic: false }); expect(create.mock.calls[0][0].data.kind).toBe('COLLECTION_UPDATED');
  });
  it('owner deletion retracts public visibility while bookmark removal leaves originals alone', async () => {
    const update = vi.fn(); const tx = { slipGroup: { findMany: vi.fn().mockResolvedValue([{ id: 'owned', publicId: 'mine', ownerId: 'viewer' }, { id: 'saved', publicId: 'other', ownerId: 'creator' }]), update }, savedCollection: { upsert: vi.fn() }, trainingEvent: { create: vi.fn() } };
    await new AccountController({ $transaction: (work: any) => work(tx) } as any).remove({ publicIds: ['mine', 'other'] }, { account: { id: 'viewer' } } as any);
    expect(update).toHaveBeenCalledTimes(1); expect(update.mock.calls[0][0]).toEqual({ where: { id: 'owned' }, data: { deletedAt: expect.any(Date), isPublic: false } }); expect(tx.savedCollection.upsert).toHaveBeenCalledTimes(2);
  });
  it('deleted collections cannot be read or shared, including by their owner', async () => {
    const group = { ownerId: 'owner', isPublic: false, deletedAt: new Date() }; const displayStatus = vi.fn();
    const svc = new GroupsService({ slipGroup: { findUnique: vi.fn().mockResolvedValue(group) } } as any, { displayStatus } as any);
    await expect(svc.getByPublicId('deleted', 'owner')).rejects.toThrow('Collection not found'); await expect(svc.publish('deleted', 'owner')).rejects.toThrow('Collection not found'); expect(displayStatus).not.toHaveBeenCalled();
  });
});

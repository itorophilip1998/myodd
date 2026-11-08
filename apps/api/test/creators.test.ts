import { describe, expect, it, vi } from 'vitest';
import { creatorLabel } from '../src/creators/creators.service';
import { GroupsService } from '../src/groups/groups.service';
import { AccountController } from '../src/auth/account.controller';

describe('creator labels', () => {
  it('uses @username when present and a short public fallback otherwise', () => {
    expect(creatorLabel({ publicId: 'abcdefghij', username: 'picks' })).toEqual({
      publicId: 'abcdefghij', username: 'picks', name: '@picks',
    });
    expect(creatorLabel({ publicId: 'abcdefghij', username: null }).name).toBe('Creator efghij');
  });
});

describe('owner collection management', () => {
  it('rejects editing someone else’s collection before any update', async () => {
    const update = vi.fn(); const tx = { slipGroup: { findFirst: vi.fn().mockResolvedValue(null), update } };
    const svc = new GroupsService({ $transaction: (work: any) => work(tx) } as any, {} as any, {} as any);
    await expect(svc.edit('public', 'not-owner', { isPublic: false })).rejects.toThrow('Collection not found'); expect(update).not.toHaveBeenCalled();
  });
  it('saves owner privacy changes and their audit event in one transaction', async () => {
    const update = vi.fn().mockResolvedValue({ publicId: 'public', title: 'Renamed', isPublic: false }); const create = vi.fn();
    const findFirst = vi.fn().mockResolvedValue({ id: 'g' }); const tx = { slipGroup: { findFirst, update }, trainingEvent: { create } };
    await new GroupsService({ $transaction: (work: any) => work(tx) } as any, {} as any, {} as any).edit('public', 'owner', { title: 'Renamed', isPublic: false });
    expect(findFirst).toHaveBeenCalledWith({ where: { publicId: 'public', ownerId: 'owner', deletedAt: null } });
    expect(update.mock.calls[0][0].data).toEqual({ title: 'Renamed', isPublic: false }); expect(create.mock.calls[0][0].data.kind).toBe('COLLECTION_UPDATED');
  });
  it('owner deletion retracts public visibility', async () => {
    const update = vi.fn(); const tx = { slipGroup: { findMany: vi.fn().mockResolvedValue([{ id: 'owned', publicId: 'mine', ownerId: 'viewer' }]), update }, savedCollection: { upsert: vi.fn() }, trainingEvent: { create: vi.fn() } };
    await new AccountController({ $transaction: (work: any) => work(tx) } as any).remove({ publicIds: ['mine', 'other'] }, { account: { id: 'viewer' } } as any);
    expect(update).toHaveBeenCalledTimes(1); expect(update.mock.calls[0][0]).toEqual({ where: { id: 'owned' }, data: { deletedAt: expect.any(Date), isPublic: false } }); expect(tx.savedCollection.upsert).toHaveBeenCalledTimes(1);
  });
  it('deleted collections cannot be read or shared, including by their owner', async () => {
    const group = { ownerId: 'owner', isPublic: false, deletedAt: new Date() }; const displayStatus = vi.fn();
    const svc = new GroupsService({ slipGroup: { findUnique: vi.fn().mockResolvedValue(group) } } as any, { displayStatus } as any, {} as any);
    await expect(svc.getByPublicId('deleted', 'owner')).rejects.toThrow('Collection not found'); await expect(svc.publish('deleted', 'owner')).rejects.toThrow('Collection not found'); expect(displayStatus).not.toHaveBeenCalled();
  });
});

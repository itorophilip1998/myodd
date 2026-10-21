import { describe, expect, it, vi } from 'vitest';
import { GroupsService } from '../src/groups/groups.service';
import { GroupsController } from '../src/groups/groups.controller';
import { formatPlaySummary } from '../../web/src/lib/play-summary';

const group = { id: 'db-group', publicId: 'group-PublicID', userSaved: true, isPublic: false,
  ownerId: 'owner', deletedAt: null };
const summary = { tickets: 1, won: 0, lost: 0, awaitingConfirmation: 1, open: 0, live: 0,
  done: 0, unknown: 1, legsOpen: 0, legsLive: 0, legsDone: 0 };

function setup() {
  const prisma = { slipGroup: { findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue({ ...group, slips: [{ id: 'ticket-id' }] }) },
    generatedSlip: { findFirst: vi.fn().mockResolvedValue(null) } };
  const checks = { checkSlips: vi.fn().mockResolvedValue([{ slipId: 'ticket-id', bookingCode: 'ABC123' }]),
    summarize: vi.fn().mockReturnValue(summary) };
  return { prisma, checks, service: new GroupsService(prisma as any, {} as any, checks as any) };
}

describe('saved code result lookup', () => {
  it.each(['ABC123', '  abc123  ', 'ticket-id'])('checks a saved booking code or ticket ID: %s', async input => {
    const { service, prisma, checks } = setup();
    prisma.generatedSlip.findFirst.mockResolvedValue({ id: 'ticket-id', bookingCode: 'ABC123', group } as any);
    expect(await service.lookupAndCheck(input, 'owner')).toEqual({
      kind: 'code', identifier: 'ABC123', href: '/code/ABC123', summary,
    });
    expect(checks.checkSlips).toHaveBeenCalledWith(['ticket-id']);
    const where = prisma.generatedSlip.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ id: input.trim() }, { bookingCode: input.trim().toUpperCase() }]);
    expect(where.group).toEqual({ deletedAt: null, userSaved: true, OR: [{ isPublic: true }, { ownerId: 'owner' }] });
  });
  it.each(['group-PublicID', 'db-group'])('checks a whole collection by ID: %s', async input => {
    const { service, prisma, checks } = setup();
    prisma.slipGroup.findFirst.mockResolvedValue(group as any);
    expect(await service.lookupAndCheck(input, 'owner')).toMatchObject({
      kind: 'group', identifier: group.publicId, href: `/g/${group.publicId}`, summary,
    });
    expect(prisma.generatedSlip.findFirst).not.toHaveBeenCalled();
    expect(checks.checkSlips).toHaveBeenCalledWith(['ticket-id']);
    expect(prisma.slipGroup.findFirst.mock.calls[0][0].where.AND[1]).toEqual({ OR: [{ publicId: input }, { id: input }] });
  });
  it('finds the collection from its original booking code', async () => {
    const { service, prisma } = setup();
    prisma.slipGroup.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(group as any);
    expect(await service.lookupAndCheck(' source1 ', 'owner')).toMatchObject({ kind: 'group' });
    expect(prisma.slipGroup.findFirst.mock.calls[1][0].where.AND[1]).toEqual({ originalBookingCode: 'SOURCE1' });
  });
  it('keeps anonymous lookups restricted to saved public collections', async () => {
    const { service, prisma, checks } = setup();
    await expect(service.lookupAndCheck('MISSING')).rejects.toThrow('No saved ticket or collection found');
    expect(checks.checkSlips).not.toHaveBeenCalled();
    expect(prisma.generatedSlip.findFirst.mock.calls[0][0].where.group).toEqual({
      deletedAt: null, userSaved: true, OR: [{ isPublic: true }],
    });
  });
  it('does not check another account’s private ticket', async () => {
    const { service, prisma, checks } = setup();
    prisma.generatedSlip.findFirst.mockResolvedValue({ id: 'private', bookingCode: 'ABC123', group } as any);
    await expect(service.lookupAndCheck('ABC123', 'other')).rejects.toThrow('No saved ticket or collection found');
    expect(checks.checkSlips).not.toHaveBeenCalled();
  });
  it('filters inaccessible duplicates before choosing the latest booking to check', async () => {
    const { service, prisma } = setup();
    prisma.generatedSlip.findFirst.mockResolvedValue({ id: 'ticket-id', bookingCode: 'ABC123', group } as any);
    await service.checkPlayCode(' abc123 ', 'owner');
    expect(prisma.generatedSlip.findFirst.mock.calls[0][0].where).toMatchObject({
      bookingCode: 'ABC123', group: { AND: [
        { deletedAt: null, OR: [{ isPublic: true, userSaved: true }, { userSaved: false }, { ownerId: 'owner' }] },
        { OR: [{ userSaved: true }, { ownerId: 'owner' }] },
      ] },
    });
  });
});

it('rejects invalid lookup input before rate limiting or database access', async () => {
  const lookupAndCheck = vi.fn();
  const consume = vi.fn();
  const controller = new GroupsController({ lookupAndCheck } as any, { consume } as any);
  for (const identifier of ['', ' ', '../../private', 'a'.repeat(129)]) {
    await expect(controller.lookup({ identifier }, {} as any)).rejects.toThrow('Enter a valid');
  }
  expect(consume).not.toHaveBeenCalled();
  expect(lookupAndCheck).not.toHaveBeenCalled();
});

it('never describes an unconfirmed check as open/live or successfully verified', () => {
  expect(formatPlaySummary(summary)).toContain('play status not confirmed');
  expect(formatPlaySummary(summary)).not.toMatch(/open|live|Verified/);
  expect(formatPlaySummary({ ...summary, unknown: 0, done: 1 })).toBe('1 done · 1 result not confirmed');
});

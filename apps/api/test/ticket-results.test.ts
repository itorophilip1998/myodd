import { describe, expect, it, vi } from 'vitest';
import { aggregateSettlement, explicitSettlement, inferSettlementFromStatus, settlementKey } from '@myodd/shared';
import { PlayCheckService } from '../src/groups/play-check.service';
import { matchPhase } from '../src/groups/play-leg-status';
import { parseSharePageSettlement } from '../src/bookmaker/sportybet.settlement';
import { mapShareResponse } from '../src/bookmaker/sportybet.mapper';
import { SettlementProcessor } from '../src/groups/settlement-maintenance';

const leg = { id: 'leg', sportyEventId: 'event', marketId: '18', outcomeId: 'over',
  specifier: 'total=2.5', kickoffAt: new Date('2020-01-01'), homeTeam: 'A', awayTeam: 'B' };
const selection = { eventId: leg.sportyEventId, marketId: leg.marketId, outcomeId: leg.outcomeId,
  specifier: leg.specifier, settlement: 'WON' };
function setup(selections: any[] = [selection], page = new Map(), fixtures: any[] = []) {
  const prisma = {
    slipSelection: { update: vi.fn().mockImplementation(args => Promise.resolve(args)) },
    generatedSlip: { update: vi.fn().mockImplementation(args => Promise.resolve(args)) },
    trainingEvent: { create: vi.fn().mockImplementation(args => Promise.resolve(args)) },
    $transaction: vi.fn().mockImplementation(operations => Promise.all(operations)),
  };
  const bookmaker = { getBooking: vi.fn().mockResolvedValue({ code: 'ABC123', selections, unavailableOutcomes: [] }),
    getFixtures: vi.fn().mockResolvedValue(fixtures), getLiveFixtures: vi.fn().mockResolvedValue([]) };
  const catalog = { validate: vi.fn() };
  const scraper = { fetchShareSettlement: vi.fn().mockResolvedValue(page) };
  const service = new PlayCheckService(prisma as any, scraper as any, bookmaker as any);
  return { service, prisma, bookmaker, catalog, scraper };
}
function html(rows: unknown[]) {
  return `<script id="__NEXT_DATA__">${JSON.stringify({ outcomes: rows })}</script>`;
}

describe('conservative result evidence', () => {
  it.each([2, 3, '2', '3', 'not won', 'not lost', 'unsuccessful', 'incorrect', 'dead heat', 'cancelled', 'half won'])('does not guess a final result from %s', status => {
    expect(inferSettlementFromStatus(status)).toBe('UNKNOWN');
  });
  it('does not choose one of conflicting fields', () => {
    expect(explicitSettlement('won', 'lost')).toBe('UNKNOWN');
  });
  it('does not settle from generic outcome status', () => {
    const booking = mapShareResponse({ shareCode: 'ABC123', outcomes: [{
      eventId: 'event', marketId: '18', outcomeId: 'over', status: 'won',
    }] }, 'ng');
    expect(booking.selections[0].settlement).toBe('UNKNOWN');
  });
  it('preserves line-specific results and rejects conflicting rows', () => {
    const key = settlementKey(selection);
    const other = { ...selection, specifier: 'total=1.5' };
    const parsed = parseSharePageSettlement(html([
      { ...selection, result: 'won' }, { ...other, result: 'lost' },
    ]));
    expect(parsed.byLeg[key]).toBe('WON');
    expect(parsed.byLeg[settlementKey(other)]).toBe('LOST');
    expect(parseSharePageSettlement(html([
      { ...selection, result: 'won' }, { ...selection, result: 'lost' },
    ])).byLeg[key]).toBe('UNKNOWN');
  });
  it('ignores prose, unrelated HTML matches, and numeric result codes', () => {
    const parsed = parseSharePageSettlement('Ticket won ' + JSON.stringify({ ...selection, result: 'won' }) + html([{ ...selection, result: 2 }]));
    expect(parsed.byLeg).toEqual({});
  });
  it('does not misread suspended as penalties or halftime as full time', () => {
    expect(matchPhase({ kickoffMs: null, nowMs: Date.now(), matchStatus: 'Suspended' })).toBe('unknown');
    expect(matchPhase({ kickoffMs: null, nowMs: Date.now(), matchStatus: 'Halftime' })).toBe('live');
    expect(matchPhase({ kickoffMs: null, nowMs: Date.now(), matchStatus: 'not finished' })).toBe('unknown');
  });
  it('does not infer match completion or live play from an old kickoff', () => {
    expect(matchPhase({ kickoffMs: 1000, nowMs: 86400000 })).toBe('unknown');
    expect(matchPhase({ kickoffMs: 1000, nowMs: 2000 })).toBe('unknown');
  });
});

describe('accumulator result', () => {
  it.each([
    [[], 'UNKNOWN'], [['WON', 'VOID'], 'WON'], [['VOID', 'VOID'], 'VOID'],
    [['WON', 'PENDING'], 'PENDING'], [['WON', 'UNKNOWN'], 'UNKNOWN'],
    [['LOST', 'PENDING', 'UNKNOWN'], 'LOST'],
  ] as const)('aggregates %j as %s', (results, expected) => {
    expect(aggregateSettlement([...results])).toBe(expected);
  });
});

describe('saved booking checks', () => {
  it('stores a confirmed win, source, evidence and audit atomically using a fresh booking', async () => {
    const { service, prisma, bookmaker, catalog } = setup();
    expect((await service.checkOne('slip', 'ABC123', [leg])).result).toBe('WON');
    expect(bookmaker.getBooking).toHaveBeenCalledWith('ABC123', { fresh: true });
    expect(catalog.validate).not.toHaveBeenCalled();
    expect(prisma.slipSelection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      result: 'WON', resultSource: 'SPORTYBET_SHARE_JSON', resultEvidence: expect.objectContaining({ selectionKey: settlementKey(selection) }),
    }) }));
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.trainingEvent.create).toHaveBeenCalledOnce();
  });
  it('reports loss immediately while another match is pending', async () => {
    const { service } = setup([{ ...selection, settlement: 'LOST' }]);
    const result = await service.checkOne('slip', 'ABC123', [leg, { ...leg, id: 'second', sportyEventId: 'other', kickoffAt: new Date('2099-01-01') }]);
    expect(result.result).toBe('LOST');
    expect(result.cutLegs).toBe(1);
    expect(result.playStatus).toBe('OPEN');
  });
  it('never uses an unqualified page result for a line-specific bet', async () => {
    const page = new Map([[settlementKey({ ...selection, specifier: '' }), 'WON']]);
    const { service } = setup([], page);
    expect((await service.checkOne('slip', 'ABC123', [leg])).result).toBe('UNKNOWN');
  });
  it('rejects conflicting available and unavailable rows for the same selection', async () => {
    const { service, bookmaker } = setup();
    bookmaker.getBooking.mockResolvedValue({ code: 'ABC123', selections: [selection], unavailableOutcomes: [{ ...selection, settlement: 'LOST' }] });
    expect((await service.checkOne('slip', 'ABC123', [leg])).result).toBe('UNKNOWN');
  });
  it('does not accept contradictory page evidence fetched for another unresolved leg', async () => {
    const { service } = setup([selection], new Map([[settlementKey(selection), 'LOST']]));
    const result = await service.checkOne('slip', 'ABC123', [leg, { ...leg, id: 'second', sportyEventId: 'other' }]);
    expect(result.result).toBe('UNKNOWN');
  });
  it('recognizes a fixture explicitly returned by the live feed even with an opaque match status', async () => {
    const { service } = setup([]);
    const result = await service.checkOne('slip', 'ABC123', [leg], [{ eventId: 'event', matchStatus: 'opaque', liveStatus: 'Live' } as any]);
    expect(result.playStatus).toBe('LIVE');
    expect(result.result).toBe('PENDING');
  });
  it('keeps finished matches awaiting confirmation when settlement is missing', async () => {
    const { service } = setup([], new Map(), [{ eventId: 'event', matchStatus: 'Finished' }]);
    const result = await service.checkOne('slip', 'ABC123', [leg]);
    expect(result.playStatus).toBe('ALL_PLAYED');
    expect(result.result).toBe('UNKNOWN');
  });
  it('checks event phases fresh and preserves an explicitly finished phase from the booking after feed expiry', async () => {
    const booking = mapShareResponse({ shareCode: 'ABC123', unavailableOutcomes: [{
      eventId: leg.sportyEventId, matchStatus: 'Finished', estimateStartTime: leg.kickoffAt.getTime(),
      markets: [{ id: leg.marketId, desc: 'Total', specifier: leg.specifier,
        outcomes: [{ id: leg.outcomeId, desc: 'Over', odds: 1.5 }] }],
    }] }, 'ng');
    const { service, bookmaker } = setup([]);
    bookmaker.getBooking.mockResolvedValue(booking);
    const result = await service.checkOne('slip', 'ABC123', [leg]);
    expect(bookmaker.getFixtures).toHaveBeenCalledWith({ eventIds: ['event'], fresh: true });
    expect(result.playStatus).toBe('ALL_PLAYED');
    expect(result.result).toBe('UNKNOWN');
  });
  it('fetches shared event fixtures once when checking several saved tickets', async () => {
    const { service, prisma, bookmaker } = setup([], new Map(), [{ eventId: 'event', matchStatus: 'Finished' }]);
    (prisma.generatedSlip as any).findMany = vi.fn().mockResolvedValue([
      { id: 'first', bookingCode: 'ABC123', selections: [leg] },
      { id: 'second', bookingCode: 'ABC123', selections: [{ ...leg, id: 'leg2' }] },
    ]);
    const results = await service.checkSlips(['first', 'second']);
    expect(results.map(r => r.playStatus)).toEqual(['ALL_PLAYED', 'ALL_PLAYED']);
    expect(bookmaker.getFixtures).toHaveBeenCalledTimes(1);
    expect(bookmaker.getLiveFixtures).toHaveBeenCalledTimes(1);
  });
  it('preserves prior confirmed evidence during an outage without refreshing its timestamp', async () => {
    const { service, bookmaker, prisma } = setup();
    bookmaker.getBooking.mockRejectedValue(new Error('Unavailable'));
    expect((await service.checkOne('slip', 'ABC123', [{ ...leg, result: 'WON', resultEvidence: { result: 'WON' }, resultSource: 'SPORTYBET_SHARE_JSON' }])).result).toBe('WON');
    expect(prisma.slipSelection.update.mock.calls[0][0].data).not.toHaveProperty('resultCheckedAt');
  });
  it('allows an explicit correction to replace a previous confirmed result', async () => {
    const { service } = setup([{ ...selection, settlement: 'LOST' }]);
    expect((await service.checkOne('slip', 'ABC123', [{ ...leg, result: 'WON', resultEvidence: { result: 'WON' } }])).result).toBe('LOST');
  });
  it('keeps conflicting JSON evidence unknown even with a previous win', async () => {
    const { service } = setup([{ ...selection, settlement: 'UNKNOWN', settlementConflict: true }]);
    expect((await service.checkOne('slip', 'ABC123', [{ ...leg, result: 'WON', resultEvidence: { result: 'WON' } }])).result).toBe('UNKNOWN');
  });
  it('does not trust a response for another booking code', async () => {
    const { service, bookmaker } = setup();
    bookmaker.getBooking.mockResolvedValue({ code: 'OTHER', selections: [selection], unavailableOutcomes: [] });
    expect((await service.checkOne('slip', 'ABC123', [leg])).result).toBe('UNKNOWN');
  });
  it('does not double count losing legs in completion totals', () => {
    const { service } = setup();
    expect(service.summarize([{ playStatus: 'ALL_PLAYED', playedLegs: 2, cutLegs: 1, openLegs: 0, liveLegs: 0 }]).legsDone).toBe(2);
  });
});

it('queues unresolved archived tickets and recent corrections, and continues after individual check failures', async () => {
  const prisma = { generatedSlip: { findMany: vi.fn().mockResolvedValue([{ id: 'first' }, { id: 'second' }]) } };
  const checks = { checkSlips: vi.fn().mockRejectedValueOnce(new Error('DB down')).mockResolvedValueOnce([]) };
  const processor = new SettlementProcessor(prisma as any, checks as any);
  await expect(processor.process()).rejects.toThrow('retry required');
  expect(checks.checkSlips).toHaveBeenCalledTimes(2);
  expect(prisma.generatedSlip.findMany.mock.calls[0][0].where).not.toHaveProperty('expiresAt');
});

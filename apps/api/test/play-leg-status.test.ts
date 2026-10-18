import { describe, expect, it } from 'vitest';
import { decideLegPlayStatus } from '../src/groups/play-leg-status';
import { parseSharePageSettlement } from '../src/bookmaker/sportybet.settlement';
import { inferSettlementFromStatus, settlementKey } from '@myodd/shared';

describe('decideLegPlayStatus', () => {
  const base = {
    score: '2 : 1',
    matchLabel: 'A vs B',
    pickLabel: '1X2: Home',
    unavailablePrematch: false,
  };

  it('marks explicit wins as PLAYED even when markets are inactive', () => {
    const result = decideLegPlayStatus({ ...base, phase: 'finished', settlement: 'WON' });
    expect(result.playStatus).toBe('PLAYED');
    expect(result.playNote).toMatch(/Won/);
  });

  it('marks explicit losses as CUT', () => {
    const result = decideLegPlayStatus({ ...base, phase: 'finished', settlement: 'LOST' });
    expect(result.playStatus).toBe('CUT');
    expect(result.playNote).toMatch(/Lost/);
  });

  it('does not invent CUT for finished legs without settlement', () => {
    const result = decideLegPlayStatus({ ...base, phase: 'finished', settlement: 'UNKNOWN' });
    expect(result.playStatus).toBe('UNKNOWN');
    expect(result.playNote).not.toMatch(/lost/i);
  });

  it('cuts prematch unavailable selections only before kickoff', () => {
    const cut = decideLegPlayStatus({
      ...base,
      phase: 'prematch',
      settlement: 'UNKNOWN',
      unavailablePrematch: true,
    });
    expect(cut.playStatus).toBe('CUT');
    const open = decideLegPlayStatus({
      ...base,
      phase: 'prematch',
      settlement: 'UNKNOWN',
      unavailablePrematch: false,
    });
    expect(open.playStatus).toBe('UPCOMING');
  });

  it('keeps live legs LIVE without treating inactive markets as cut', () => {
    const result = decideLegPlayStatus({ ...base, phase: 'live', settlement: 'PENDING' });
    expect(result.playStatus).toBe('LIVE');
  });
});

describe('inferSettlementFromStatus', () => {
  it('recognizes won/lost/void strings', () => {
    expect(inferSettlementFromStatus('Won')).toBe('WON');
    expect(inferSettlementFromStatus('lost')).toBe('LOST');
    expect(inferSettlementFromStatus('void')).toBe('VOID');
  });
});

describe('parseSharePageSettlement', () => {
  it('extracts settlement from embedded share JSON', () => {
    const html = `
      <html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            outcomes: [{
              eventId: 'sr:match:1',
              marketId: '1',
              outcomeId: '2',
              specifier: '',
              settleStatus: 'won',
            }],
          },
        },
      })}</script></html>`;
    const parsed = parseSharePageSettlement(html);
    const key = settlementKey({
      eventId: 'sr:match:1',
      marketId: '1',
      outcomeId: '2',
      specifier: '',
    });
    expect(parsed.byLeg[key]).toBe('WON');
  });
});

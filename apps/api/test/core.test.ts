import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { slipFingerprint, scoreSlip } from '../src/slips/slip-fingerprint';
import { SupportedMarket } from '@myodd/shared';
import { toSharePayload, mapShareResponse } from '../src/bookmaker/sportybet.mapper';
import { SlipValidatorService } from '../src/slips/slip-validator.service';

const config: any = { minimumOdds: 1.1, maximumOdds: 5, minimumSelections: 1, maximumSelections: 8,
  markets: [SupportedMarket.HOME], excludedTeams: [], kickoffBefore: null };
const selection: any = { eventId: '1', marketId: '1', outcomeId: '1', specifier: '', odds: 1.5,
  supportedMarket: SupportedMarket.HOME, probability: .6, confidence: 60, modelVersion: 'odds-v2' };
const fixture: any = { eventId: '1', homeTeam: 'A', awayTeam: 'B', kickoffAt: '2099-01-01T12:00:00Z',
  markets: [{ marketId: '1', specifier: '', status: '', outcomes: [{ outcomeId: '1', odds: 1.5, isActive: true }] }] };

describe('no stake booking payload', () => {
  it('contains selection IDs only', () => {
    expect(toSharePayload([selection])).toEqual({ selections: [{ eventId: '1', marketId: '1', outcomeId: '1', specifier: '' }] });
    const src = readFileSync(join(__dirname, '../src/bookmaker/sportybet.client.ts'), 'utf8');
    expect(src).toContain('assertNoStakePayload');
  });
});

describe('slip identity', () => {
  it('is independent of selection order', () => {
    const selections = [selection, { ...selection, eventId: '2' }];
    expect(slipFingerprint(selections)).toBe(slipFingerprint([...selections].reverse()));
  });
  it('penalizes duplicate events', () => {
    expect(scoreSlip([selection, { ...selection, eventId: '2' }])).toBeGreaterThan(scoreSlip([selection, selection]));
  });
});

describe('fresh bookmaker validation', () => {
  const validator = new SlipValidatorService({ getFixtures: async () => [] } as any);
  it('rejects missing events instead of reusing stale selections', async () => {
    expect(await validator.validate([selection], config, [])).toBeNull();
  });
  it('rejects duplicate events', async () => {
    expect(await validator.validate([selection, selection], config, [fixture])).toBeNull();
  });
  it('rejects updated odds outside the requested range', async () => {
    expect(await validator.validate([selection], { ...config, maximumOdds: 1.4 }, [fixture])).toBeNull();
  });
  it('rejects excluded teams', async () => {
    expect(await validator.validate([selection], { ...config, excludedTeams: ['A'] }, [fixture])).toBeNull();
  });
  it('accepts active, future selections meeting all filters', async () => {
    expect(await validator.validate([selection], config, [fixture])).toHaveLength(1);
  });
});

it('maps booking selections and combined odds', () => {
  const booking = mapShareResponse({ shareCode: 'ABC123', outcomes: [{ eventId: '1', marketId: '1', outcomeId: '1', odds: 1.5 }] }, 'ng');
  expect(booking.code).toBe('ABC123');
  expect(booking.totalOdds).toBe(1.5);
});

describe('SportyBet nested share responses', () => {
  const response = {
    shareCode: 'ME9915',
    ticket: { displayTotalOdds: '29.17', selections: [{ eventId: 'event-1', marketId: '14', specifier: 'hcp=1:0', outcomeId: '1711' }] },
    outcomes: [{ eventId: 'event-1', homeTeamName: 'Home', awayTeamName: 'Away', status: 0,
      sport: { category: { tournament: { name: 'League' } } }, estimateStartTime: Date.UTC(2099, 0, 1),
      markets: [{ id: '14', desc: 'Handicap 1:0', status: 0, specifier: 'hcp=1:0', outcomes: [
        { id: '1711', desc: 'Home (1:0)', odds: '1.50', isActive: 1 },
        { id: '1712', desc: 'Away', odds: '2.50', isActive: 1 },
      ] }] }],
  };
  it('uses ticket IDs to select the booked nested outcome and populate its labels and odds', () => {
    const booking = mapShareResponse(response, 'ng');
    expect(booking.totalOdds).toBe(29.17);
    expect(booking.selections).toHaveLength(1);
    expect(booking.selections[0]).toMatchObject({ marketId: '14', outcomeId: '1711', odds: 1.5,
      marketName: 'Handicap 1:0', selectionName: 'Home (1:0)', league: 'League', isActive: true });
  });
  it('computes combined odds when the ticket total is absent', () => {
    expect(mapShareResponse({ ...response, ticket: { selections: response.ticket.selections } }, 'ng').totalOdds).toBe(1.5);
  });
  it('does not turn missing prices into 1.00 odds', () => {
    expect(mapShareResponse({ shareCode: 'MISSING', outcomes: [{ eventId: '1' }] }, 'ng').totalOdds).toBeNull();
  });
  it('does not substitute a different outcome when a booked outcome is unavailable', () => {
    const booking = mapShareResponse({ ...response, ticket: { selections: [{ ...response.ticket.selections[0], outcomeId: 'gone' }] } }, 'ng');
    expect(booking.selections[0]).toMatchObject({ outcomeId: 'gone', isActive: false });
    expect(booking.totalOdds).toBeNull();
  });
});

it('treats requested markets as preferences unless explicitly marked only', async () => {
  const validator = new SlipValidatorService({} as any);
  const other = { ...selection, supportedMarket: SupportedMarket.OTHER };
  expect(await validator.validate([other], { ...config, marketPolicy: 'prefer' }, [fixture])).toHaveLength(1);
  expect(await validator.validate([other], { ...config, marketPolicy: 'only' }, [fixture])).toBeNull();
});

it('validates dynamic market IDs and outcomes under an only restriction', async () => {
  const validator = new SlipValidatorService({} as any);
  const dynamicConfig = { ...config, marketPolicy: 'only', markets: [], marketRules: [{ marketId: '1', specifier: '', outcomeIds: ['1'] }] };
  expect(await validator.validate([selection], dynamicConfig, [fixture])).toHaveLength(1);
  expect(await validator.validate([selection], { ...dynamicConfig, marketRules: [{ marketId: '1', specifier: '', outcomeIds: ['other'] }] }, [fixture])).toBeNull();
});

it('keeps a locally verified same-period alternative inside the booking boundary', async () => {
  const validator = new SlipValidatorService({} as any);
  const rules = { ...config, markets: [], marketQueries: ['draw in minutes 1-10'], marketPolicy: 'only',
    marketRules: [{ marketId: 'ten', specifier: '', outcomeIds: ['draw'] }],
    relatedMarketRules: [{ marketId: '1', specifier: '', outcomeIds: ['1'] }] };
  expect(await validator.validate([selection], rules, [fixture])).toHaveLength(1);
  expect(await validator.validate([selection], { ...rules, relatedMarketRules: [] }, [fixture])).toBeNull();
});

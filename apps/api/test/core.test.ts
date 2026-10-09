import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OddsImpliedEngine } from '../src/predictions/odds-implied.engine';
import { SupportedMarket } from '@myodd/shared';
import { slipFingerprint, scoreSlip } from '../src/slips/slip-fingerprint';
import { parseInstructionRules } from '../src/ai/rules-intent.parser';
import { toSharePayload } from '../src/bookmaker/sportybet.mapper';

describe('no-stake guarantee', () => {
  it('client source forbids wager endpoints and stake fields', () => {
    const src = readFileSync(
      join(__dirname, '../src/bookmaker/sportybet.client.ts'),
      'utf8',
    );
    expect(src).toContain('/orders/share');
    expect(src).toContain('assertNoStakePayload');
    expect(src).not.toMatch(/orders\/place/);
  });

  it('share payload only contains selection ids', () => {
    const payload = toSharePayload([
      {
        eventId: 'sr:match:1',
        marketId: '1',
        outcomeId: '1',
        specifier: '',
      },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/stake|amount|wager|wallet/i);
  });
});

describe('OddsImpliedEngine', () => {
  it('scores favourites higher than long shots', () => {
    const engine = new OddsImpliedEngine();
    const outcomes = [
      { outcomeId: '1', outcomeName: 'Home', odds: 1.4, isActive: true },
      { outcomeId: '2', outcomeName: 'Draw', odds: 4.5, isActive: true },
      { outcomeId: '3', outcomeName: 'Away', odds: 7, isActive: true },
    ];
    const fav = engine.score(
      {
        eventId: '1',
        marketId: '1',
        outcomeId: '1',
        specifier: '',
        odds: 1.4,
        isActive: true,
      },
      { marketOutcomes: outcomes, supportedMarket: SupportedMarket.HOME },
    );
    const dog = engine.score(
      {
        eventId: '1',
        marketId: '1',
        outcomeId: '3',
        specifier: '',
        odds: 7,
        isActive: true,
      },
      { marketOutcomes: outcomes, supportedMarket: SupportedMarket.AWAY },
    );
    expect(fav.confidence).toBeGreaterThan(dog.confidence);
    expect(fav.probability).toBeGreaterThan(dog.probability);
  });
});

describe('slip fingerprint', () => {
  it('is order-independent', () => {
    const a = [
      { eventId: '1', marketId: '1', outcomeId: '1', specifier: '' },
      { eventId: '2', marketId: '10', outcomeId: '9', specifier: '' },
    ];
    const b = [...a].reverse();
    expect(slipFingerprint(a)).toBe(slipFingerprint(b));
  });
});

describe('rules intent parser', () => {
  it('parses safer slips between odds', () => {
    const cfg = parseInstructionRules(
      'Create 20 lower-risk slips between 3 and 5 odds. Prefer over 1.5 and double chance.',
    );
    expect(cfg.numberOfSlips).toBe(20);
    expect(cfg.minimumOdds).toBe(3);
    expect(cfg.maximumOdds).toBe(5);
    expect(cfg.riskPreference).toBe('LOWER');
    expect(cfg.markets.length).toBeGreaterThan(0);
  });
});

describe('mapShareResponse', () => {
  it('maps shareCode and combined odds', async () => {
    const { mapShareResponse } = await import(
      '../src/bookmaker/sportybet.mapper'
    );
    const booking = mapShareResponse(
      {
        shareCode: 'ABC123',
        shareURL: 'https://www.sportybet.com/ng/?shareCode=ABC123',
        deadline: Date.now() + 3600000,
        outcomes: [
          { eventId: '1', marketId: '1', outcomeId: '1', specifier: '', odds: 1.5 },
          { eventId: '2', marketId: '18', outcomeId: '12', specifier: 'total=1.5', odds: 1.4 },
        ],
      },
      'ng',
    );
    expect(booking.code).toBe('ABC123');
    expect(booking.totalOdds).toBe(2.1);
  });
});

describe('scoreSlip', () => {
  it('penalizes duplicate events', () => {
    const base = {
      eventId: '1',
      marketId: '1',
      outcomeId: '1',
      specifier: '',
      odds: 1.5,
      supportedMarket: SupportedMarket.HOME,
      probability: 0.6,
      confidence: 80,
      modelVersion: 'odds-v1',
    };
    const unique = scoreSlip([
      base,
      { ...base, eventId: '2', outcomeId: '2' },
    ]);
    const dup = scoreSlip([base, { ...base, outcomeId: '2' }]);
    expect(unique).toBeGreaterThan(dup);
  });
});

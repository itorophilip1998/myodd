import { describe, expect, it } from 'vitest';
import { formatOdds, exactOdds, parseOddsToken } from '@myodd/shared';

describe('compact odds display', () => {
  it.each([[1.03, '1.03'], [999, '999'], [1000, '1ks'], [184775.21, '185ks'], [999500, '1ms'],
    [1e6, '1ms'], [1e7, '10ms'], [1e8, '100ms'], [1e9, '1b'], [1e12, '1t'], [1e15, '1q'], [1e120, '1e120']])('formats %s as %s', (value, label) => expect(formatOdds(Number(value))).toBe(label));
  it('keeps exact totals for tooltips', () => expect(exactOdds(184775.21)).toBe('184,775.21'));
  it('does not display an invalid total as real odds', () => expect(formatOdds(Infinity)).toBe('—'));
});

describe('compact odds parsing', () => {
  it.each([
    ['5', 5], ['2.5', 2.5], ['20ks', 20000], ['20k', 20000], ['1.5ms', 1.5e6], ['1m', 1e6], ['2b', 2e9],
  ])('parses %s as %s', (token, value) => expect(parseOddsToken(token)).toBe(value));
  it('rejects non-odds tokens', () => {
    expect(parseOddsToken('')).toBeNull();
    expect(parseOddsToken('abc')).toBeNull();
    expect(parseOddsToken('-3')).toBeNull();
  });
});

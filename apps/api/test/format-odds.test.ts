import { describe, expect, it } from 'vitest';
import { formatOdds, exactOdds } from '@myodd/shared';

describe('compact odds display', () => {
  it.each([[1.03, '1.03'], [999, '999'], [1000, '1k'], [184775.21, '185k'], [999500, '1m'],
    [1e6, '1m'], [1e7, '10m'], [1e8, '100m'], [1e9, '1b'], [1e12, '1t'], [1e15, '1q'], [1e120, '1e120']])('formats %s as %s', (value, label) => expect(formatOdds(Number(value))).toBe(label));
  it('keeps the exact total available separately', () => expect(exactOdds(184775.21)).toBe('184,775.21'));
  it('does not display an invalid total as real odds', () => expect(formatOdds(Infinity)).toBe('—'));
});

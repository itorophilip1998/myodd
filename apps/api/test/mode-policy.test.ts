import { expect, it } from 'vitest';
import { withinModeOdds } from '@myodd/shared';
it('enforces every mode boundary, including no artificial Lagoslife ceiling', () => {
  expect(withinModeOdds(10, 'INVESTOR')).toBe(true);
  expect(withinModeOdds(10.01, 'INVESTOR')).toBe(false);
  expect(withinModeOdds(10, 'GAMBLER')).toBe(false);
  expect(withinModeOdds(10.01, 'GAMBLER')).toBe(true);
  expect(withinModeOdds(100, 'GAMBLER')).toBe(true);
  expect(withinModeOdds(100, 'JAPA')).toBe(false);
  expect(withinModeOdds(500, 'JAPA')).toBe(true);
  expect(withinModeOdds(500, 'LAGOS_LIFE')).toBe(false);
  expect(withinModeOdds(1e120, 'LAGOS_LIFE')).toBe(true);
  expect(withinModeOdds(Infinity, 'LAGOS_LIFE')).toBe(false);
});

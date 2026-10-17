import { expect, it } from 'vitest';
import { clampOddsToMode, withinModeOdds, withinModeSelectionOdds } from '@myodd/shared';
it('enforces every mode boundary, including no artificial Lagoslife ceiling', () => {
  expect(withinModeOdds(2, 'INVESTOR')).toBe(true);
  expect(withinModeOdds(5, 'INVESTOR')).toBe(true);
  expect(withinModeOdds(5.01, 'INVESTOR')).toBe(false);
  expect(withinModeOdds(5, 'GAMBLER')).toBe(false);
  expect(withinModeOdds(5.01, 'GAMBLER')).toBe(true);
  expect(withinModeOdds(20, 'GAMBLER')).toBe(true);
  expect(withinModeOdds(20, 'JAPA')).toBe(false);
  expect(withinModeOdds(20.01, 'JAPA')).toBe(true);
  expect(withinModeOdds(100, 'JAPA')).toBe(true);
  expect(withinModeOdds(100, 'LAGOS_LIFE')).toBe(false);
  expect(withinModeOdds(100.01, 'LAGOS_LIFE')).toBe(true);
  expect(withinModeOdds(1e120, 'LAGOS_LIFE')).toBe(true);
  expect(withinModeOdds(Infinity, 'LAGOS_LIFE')).toBe(false);
});

it('enforces safe per-game odds inside named-mode tickets', () => {
  expect(withinModeSelectionOdds(1.1, 'INVESTOR')).toBe(true);
  expect(withinModeSelectionOdds(1.5, 'INVESTOR')).toBe(true);
  expect(withinModeSelectionOdds(1.51, 'INVESTOR')).toBe(false);
  expect(withinModeSelectionOdds(1.8, 'GAMBLER')).toBe(true);
  expect(withinModeSelectionOdds(1.81, 'GAMBLER')).toBe(false);
  expect(withinModeSelectionOdds(2, 'JAPA')).toBe(true);
  expect(withinModeSelectionOdds(2.01, 'JAPA')).toBe(false);
  expect(withinModeSelectionOdds(2, 'LAGOS_LIFE')).toBe(true);
  expect(withinModeSelectionOdds(2.01, 'LAGOS_LIFE')).toBe(false);
  expect(withinModeSelectionOdds(1.09, null)).toBe(false);
  expect(withinModeSelectionOdds(9, null)).toBe(true);
});

it('clamps a manual ticket-odds range into the selected mode band', () => {
  expect(clampOddsToMode(4, 5, 'INVESTOR')).toEqual({ minimum: 4, maximum: 5 });
  expect(clampOddsToMode(1, 10, 'INVESTOR')).toEqual({ minimum: 2, maximum: 5 });
  // Range fully below Gambler floor falls back to the mode band.
  expect(clampOddsToMode(4, 5, 'GAMBLER')).toEqual({ minimum: 5.01, maximum: 20 });
  expect(clampOddsToMode(6, 12, 'GAMBLER')).toEqual({ minimum: 6, maximum: 12 });
  expect(clampOddsToMode(50, null, 'LAGOS_LIFE')).toEqual({ minimum: 100.01, maximum: null });
});

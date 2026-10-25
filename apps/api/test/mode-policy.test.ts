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
  expect(withinModeOdds(100, 'LAGOS_LIFE')).toBe(true);
  expect(withinModeOdds(99.99, 'LAGOS_LIFE')).toBe(false);
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
  expect(clampOddsToMode(50, null, 'LAGOS_LIFE')).toEqual({ minimum: 100, maximum: null });
});


it('accepts finite Lagoslife ranges above the old ceiling and leaves its maximum unset', async () => {
  const { previewOddsFromPrompt, generateFromPromptSchema } = await import('@myodd/shared');
  const { generateGuardrailMessage } = await import('../../web/src/lib/generate-guardrails');
  for (const maximum of [5_000_000, 1e12, null]) {
    expect(generateGuardrailMessage({ instruction: '', wantsSplit: false, mode: 'LAGOS_LIFE', oddsSource: 'manual', rawMinOdds: 100, rawMaxOdds: maximum })).toBeNull();
    expect(generateFromPromptSchema.parse({ instruction: 'Lagoslife Mode', riskMode: 'LAGOS_LIFE', minimumOdds: 100, maximumOdds: maximum }).maximumOdds).toBe(maximum);
  }
  for (const instruction of ['Lagoslife Mode from 100 to 5m odds', 'Lagoslife Mode between 100 and 5,000,000 odds']) {
    expect(previewOddsFromPrompt(instruction)).toEqual({ minimum: 100, maximum: 5_000_000 });
    expect(generateGuardrailMessage({ instruction, wantsSplit: false, mode: 'LAGOS_LIFE', oddsSource: 'prompt' })).toBeNull();
  }
  expect(previewOddsFromPrompt('from 500 to unlimited odds')).toEqual({ minimum: 500, maximum: null });
  expect(generateGuardrailMessage({ instruction: '', wantsSplit: false, mode: 'LAGOS_LIFE', oddsSource: 'manual', rawMinOdds: 100, rawMaxOdds: Infinity })).toMatch(/valid Min and Max/);
});

import { expect, it } from 'vitest';
import { generationConfigSchema, type GenerationOutcome } from '@myodd/shared';
import { generationOutcomeMessage } from '../../web/src/lib/generation-outcome-message';
import type { GenerationReport } from '../../web/src/lib/api';

const shortage: GenerationOutcome = { requestId: 'test', status: 'empty', requested: 10, generated: 0, failed: 10, errors: [{ code: 'SHORTAGE', message: 'Search found no candidates.', retryable: false }] };
function report(eligibleEvents: number, minimumOdds = 10000, maximumOdds: number | null = 10000): GenerationReport {
  return { notices: [], diagnostics: { requestedSlips: 10, foundSlips: 0, eligibleEvents, selectionPool: eligibleEvents * 2, oddsBounds: null }, effectiveConfig: generationConfigSchema.parse({ minimumOdds, maximumOdds }) };
}
it('uses an empty-match explanation only when measured eligibility is zero', () => {
  expect(generationOutcomeMessage(shortage, report(0))).toContain('No eligible matches');
  expect(generationOutcomeMessage(shortage)).toContain('requested odds and options');
  expect(generationOutcomeMessage(shortage, report(101, 100, 5000000))).toContain('requested odds and options');
});
it('explains an exact-odds search failure without claiming the match pool is empty', () => {
  const message = generationOutcomeMessage(shortage, report(101));
  expect(message).toContain('exactly 10,000 odds');
  expect(message).toContain('wider odds range');
  expect(message).not.toContain('No eligible matches');
});
it('distinguishes bookmaker validation and connectivity failures from search shortages', () => {
  const withCode = (code: 'UNAVAILABLE_MARKET' | 'NETWORK_ERROR') => ({ ...shortage, status: 'failed' as const, errors: [{ code, message: '', retryable: true }] });
  expect(generationOutcomeMessage(withCode('UNAVAILABLE_MARKET'), report(101))).toContain('could not be confirmed');
  expect(generationOutcomeMessage(withCode('NETWORK_ERROR'), report(0))).toContain('provider could not complete');
});

import { exactOdds, type GenerationOutcome } from '@myodd/shared';
import type { GenerationReport } from './api';

/** Explain the failure using measured eligibility, rather than treating every shortage as an empty match pool. */
export function generationOutcomeMessage(outcome: GenerationOutcome, report?: GenerationReport | null) {
  const codes = new Set(outcome.errors.map(error => error.code));
  if (codes.has('BOOKING_UNCERTAIN')) return 'The provider has not confirmed this booking. Check its status before trying again.';
  if (codes.has('INVALID_CODE') || codes.has('UNAVAILABLE_CODE')) return 'This booking code is unavailable. Check the code or try another request.';
  if (codes.has('PROVIDER_ERROR') || codes.has('NETWORK_ERROR')) return 'The provider could not complete this request. Please try again shortly.';
  if (outcome.errors.some(error => /AI_API_KEY is required/i.test(error.message))) return 'The instruction service is not configured. Add an API key in .env, or set AI_PROVIDER=rules, then restart.';
  if (codes.has('UNAVAILABLE_MARKET')) return 'The requested selections or odds could not be confirmed. Adjust your filters and try again.';
  if (![...codes].some(code => code !== 'SHORTAGE') && (outcome.status === 'empty' || codes.has('SHORTAGE'))) {
    if (report?.diagnostics?.eligibleEvents === 0) return 'No eligible matches were available for this request. Try another match day or adjust your options.';
    const config = report?.effectiveConfig;
    if (config && config.minimumOdds === config.maximumOdds) return `No tickets were found at exactly ${exactOdds(config.minimumOdds)} odds. Use a wider odds range or adjust your options.`;
    return 'No tickets were found within your requested odds and options. Widen the odds range or adjust your options.';
  }
  return 'We could not complete this request. Please try again or adjust your options.';
}

import type { GenerationFailure } from '@myodd/shared';
import { SportyBetHttpError } from '../bookmaker/sportybet.client';

export function generationFailure(error: unknown, bookingStarted = false): GenerationFailure {
  if (error instanceof SportyBetHttpError) {
    if (bookingStarted && ['TIMEOUT', 'NETWORK'].includes(error.code)) return { code: 'BOOKING_UNCERTAIN', message: 'The provider did not confirm whether this booking was created. It will not be created again automatically.', retryable: false };
    if (['TIMEOUT', 'NETWORK'].includes(error.code)) return { code: 'NETWORK_ERROR', message: 'The betting service could not be reached. Please try again.', retryable: true };
    if (['NOT_FOUND', 'INVALID_BOOKING_CODE'].includes(error.code)) return { code: 'UNAVAILABLE_CODE', message: 'This booking code was not found or may have expired.', retryable: false };
    return { code: 'PROVIDER_ERROR', message: 'The betting service rejected this booking. Markets may have changed.', retryable: error.status === 429 || (error.status ?? 0) >= 500 };
  }
  if (error instanceof Error && /Selections no longer|SportyBet (?:marked|did not confirm)|Confirmed odds/.test(error.message)) {
    return { code: 'UNAVAILABLE_MARKET', message: 'The requested selections or odds could not be confirmed. Adjust your filters and try again.', retryable: false };
  }
  return bookingStarted
    ? { code: 'BOOKING_UNCERTAIN', message: 'The provider booking could not be confirmed. It will not be created again automatically.', retryable: false }
    : { code: 'UNEXPECTED_ERROR', message: 'This booking could not complete. Please try again.', retryable: true };
}

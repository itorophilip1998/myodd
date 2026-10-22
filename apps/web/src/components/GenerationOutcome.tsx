'use client';
import { useEffect } from 'react';
import { track } from '@/lib/analytics';
import type { GenerationOutcome as Outcome } from '@myodd/shared';

export function GenerationOutcome({ outcome }: { outcome?: Outcome }) {
  useEffect(() => {
    if (!outcome || outcome.status === 'loading') return;
    try {
      const key = `myodd-generation-event:${outcome.requestId}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, 'sent');
      track(outcome.generated > 0 ? 'generate_completed' : 'generate_failed', { requested: outcome.requested, generated: outcome.generated, failed: outcome.failed });
    } catch {}
  }, [outcome]);
  if (!outcome || outcome.status === 'success' || outcome.status === 'loading') return null;
  const codes = new Set(outcome.errors.map(error => error.code));
  const message = codes.has('BOOKING_UNCERTAIN') ? 'The provider has not confirmed this booking. Check its status before trying again.'
    : codes.has('INVALID_CODE') || codes.has('UNAVAILABLE_CODE') ? 'This booking code is unavailable. Check the code or try another request.'
    : codes.has('PROVIDER_ERROR') || codes.has('NETWORK_ERROR') ? 'The provider could not complete this request. Please try again shortly.'
    : outcome.status === 'empty' || codes.has('SHORTAGE') || codes.has('UNAVAILABLE_MARKET') ? 'No eligible matches were available for this request. Try another match day or adjust your options.'
    : 'We could not complete this request. Please try again or adjust your options.';
  return <section className="generation-outcome" role="status" aria-label="Generation result">
    <h2>{outcome.generated > 0 ? 'Partial success' : 'Unable to create codes'}</h2>
    <p>{outcome.generated > 0 ? `${outcome.generated} of ${outcome.requested} codes created. ${codes.has('BOOKING_UNCERTAIN') ? 'Some bookings are not confirmed. Check their status before trying again.' : 'Your available codes are below.'}` : message}</p>
    <a className="text-link" href="/">Adjust request</a>
  </section>;
}

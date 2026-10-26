'use client';
import { useEffect } from 'react';
import { trackOnce } from '@/lib/analytics';
import type { GenerationOutcome as Outcome } from '@myodd/shared';
import type { GenerationReport } from '@/lib/api';
import { generationOutcomeMessage } from '@/lib/generation-outcome-message';

export function GenerationOutcome({ outcome, report }: { outcome?: Outcome; report?: GenerationReport | null }) {
  useEffect(() => {
    if (!outcome || outcome.status === 'loading') return;
    try {
      trackOnce(outcome.generated > 0 ? 'generate_completed' : 'generate_failed', outcome.requestId, { requested: outcome.requested, generated: outcome.generated, failed: outcome.failed });
    } catch {}
  }, [outcome]);
  if (!outcome || outcome.status === 'success' || outcome.status === 'loading') return null;
  const codes = new Set(outcome.errors.map(error => error.code));
  const message = generationOutcomeMessage(outcome, report);
  return <section className="generation-outcome" role="status" aria-label="Generation result">
    <h2>{outcome.generated > 0 ? 'Partial success' : 'Unable to create codes'}</h2>
    <p>{outcome.generated > 0 ? `${outcome.generated} of ${outcome.requested} codes created. ${codes.has('BOOKING_UNCERTAIN') ? 'Some bookings are not confirmed. Check their status before trying again.' : 'Your available codes are below.'}` : message}</p>
    <a className="text-link" href="/">Adjust request</a>
  </section>;
}

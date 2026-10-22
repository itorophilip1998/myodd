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
  if (!outcome || outcome.status === 'success') return null;
  return <section className="generation-outcome" role="status" aria-label="Generation result">
    <h2>{({ loading: 'Generating tickets', success: 'Codes ready', partial_success: 'Partial success', empty: 'No codes this time', failed: 'Generation could not complete' })[outcome.status]}</h2>
    <p>{outcome.generated} of {outcome.requested} tickets generated{outcome.status !== 'loading' && ` · ${outcome.failed} could not be created`}.</p>
    {!!outcome.errors.length && <ul>{[...new Set(outcome.errors.map(error => error.message))].map(message => <li key={message}>{message}</li>)}</ul>}
    {outcome.status !== 'loading' && outcome.failed > 0 && <a className="text-link" href="/">Adjust settings and generate again</a>}
  </section>;
}

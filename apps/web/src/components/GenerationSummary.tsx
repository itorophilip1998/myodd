import { formatOdds } from '@myodd/shared';
import type { GenerationReport } from '@/lib/api';

export function GenerationSummary({ report }: { report: GenerationReport }) {
  const { diagnostics, effectiveConfig } = report;
  return (
    <section className="space-y-3 border border-lime/20 p-4" aria-label="Generation summary">
      <h2 className="font-display text-xl text-lime">How this request was handled</h2>
      <p className="text-sm text-sand/80">
        {diagnostics.foundSlips} of {diagnostics.requestedSlips} combinations found · {diagnostics.eligibleEvents} eligible matches
      </p>
      <p className="text-sm text-sand/60">
        Odds {formatOdds(effectiveConfig.minimumOdds)}–{effectiveConfig.maximumOdds == null ? 'No limit' : formatOdds(effectiveConfig.maximumOdds)} · {effectiveConfig.minimumSelections}–{effectiveConfig.maximumSelections} selections
        {' · '}{effectiveConfig.fixtureMode === 'original_only' ? 'Original matches only' : effectiveConfig.fixtureMode === 'upcoming' ? 'New upcoming matches' : 'Adaptive match selection'}
      </p>
      {report.notices.length > 0 && (
        <ul className="list-disc pl-5 space-y-2 text-sm text-sand/70">
          {report.notices.map((notice, index) => <li key={index}>{notice}</li>)}
        </ul>
      )}
      <p className="text-xs text-sand/50">Higher total odds remain harder to win. “Lower variance” ranks the available choices within your request.</p>
    </section>
  );
}

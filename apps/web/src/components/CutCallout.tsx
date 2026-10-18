'use client';

import { useState } from 'react';
import type { SlipSelection } from '@/lib/api';

export function CutCallout({
  selections,
  cutSummary,
}: {
  selections: SlipSelection[];
  cutSummary?: string | null;
}) {
  const [open, setOpen] = useState(true);
  const cutPicks = selections.filter(p => p.playStatus === 'CUT');
  if (!open || (!cutPicks.length && !cutSummary)) return null;

  return (
    <div className="cut-callout" role="status">
      <div className="cut-callout-head">
        <p className="cut-callout-title">Cut by</p>
        <button type="button" className="cut-callout-close" aria-label="Dismiss cut summary" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      {cutPicks.length ? (
        <ul>
          {cutPicks.map((pick, i) => (
            <li key={i}>
              <strong>{pick.homeTeam} vs {pick.awayTeam}</strong>
              <span>{pick.marketName}: {pick.selectionName}{pick.score ? ` · ${pick.score}` : ''}</span>
              {pick.playNote && <span className="cut-callout-note">{pick.playNote}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p>{cutSummary}</p>
      )}
    </div>
  );
}

import type { SelectionSettlement } from '@myodd/shared';

export const RESULT_LABEL: Record<SelectionSettlement, string> = {
  WON: 'Win', LOST: 'Loss', VOID: 'Void', PENDING: 'Pending', UNKNOWN: 'Awaiting confirmation',
};

export function ResultBadge({ result, checkedAt, source }: {
  result?: SelectionSettlement; checkedAt?: string | null; source?: string | null;
}) {
  const value = result ?? 'UNKNOWN';
  return <span className={`play-chip result-${value.toLowerCase()}`}
    title={[source === 'BBC_SPORT_SCORE' ? 'Calculated from BBC Sport full-time score' : source ? 'SportyBet settlement' : '', checkedAt ? `Evidence checked: ${checkedAt}` : '',
      'Tracks the saved booking selections without placing a bet.'].filter(Boolean).join(' · ')}>
    {RESULT_LABEL[value]}
  </span>;
}

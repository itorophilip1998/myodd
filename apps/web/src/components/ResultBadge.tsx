import type { SelectionSettlement } from '@myodd/shared';
import { RESULT_DESCRIPTION, resultStatus, type ResultState } from '@/lib/result-status';
import { formatLagosDateTime } from '@/lib/datetime';

export const RESULT_LABEL: Record<SelectionSettlement, string> = {
  WON: 'Win', LOST: 'Loss', VOID: 'Void', PENDING: 'Pending', UNKNOWN: 'Awaiting confirmation',
};

type ResultProps = ResultState & { checkedAt?: string | null; source?: string | null };

export function ResultBadge({ checkedAt, source, ...state }: ResultProps) {
  const value = resultStatus(state);
  const color = { WIN: 'result-won', CUT: 'result-lost', OPEN: 'play-open', LIVE: 'play-live', UNKNOWN: 'play-unknown' }[value];
  return <span className={`play-chip ${color}`}
    title={[RESULT_DESCRIPTION[value], source === 'BBC_SPORT_SCORE' ? 'Calculated from BBC Sport full-time score' : source ? 'SportyBet settlement' : '', checkedAt ? `Evidence checked: ${checkedAt}` : '',
      'Tracks the saved booking selections without placing a bet.'].filter(Boolean).join(' · ')}>
    {value}
  </span>;
}

const PROGRESS_LABEL = {
  OPEN: 'Not yet played', UPCOMING: 'Not yet played', LIVE: 'Running now',
  CUT: 'Done', PLAYED: 'Done', ALL_PLAYED: 'Done', UNKNOWN: 'Unidentified',
};

export function ResultDetails({ result, playStatus, checkedAt, source, ...state }: ResultProps) {
  return <p className="result-status-details">
    {RESULT_DESCRIPTION[resultStatus({ result, playStatus, ...state })]}{' '}
    Settlement: {RESULT_LABEL[result ?? 'UNKNOWN']} · Progress: {PROGRESS_LABEL[playStatus ?? 'UNKNOWN']}.
    {source && <> Source: {source === 'BBC_SPORT_SCORE' ? 'BBC Sport full-time score' : 'SportyBet settlement'}.</>}
    {checkedAt && <> Evidence checked: <time dateTime={checkedAt}>{formatLagosDateTime(checkedAt)}</time>.</>}
  </p>;
}

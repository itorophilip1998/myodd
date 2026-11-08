import type { SelectionSettlement } from '@myodd/shared';
import type { LegPlayStatus, SlipPlayStatus } from './api';

export type ResultStatus = 'OPEN' | 'CUT' | 'WIN' | 'UNKNOWN' | 'LIVE';

export interface ResultState {
  result?: SelectionSettlement;
  playStatus?: LegPlayStatus | SlipPlayStatus | null;
  displayStatus?: string;
}

export const RESULT_DESCRIPTION: Record<ResultStatus, string> = {
  OPEN: 'Pending — not yet played or awaiting a result.',
  CUT: 'Done — lost.',
  WIN: 'Done — won.',
  LIVE: 'Open — running at the moment.',
  UNKNOWN: 'Unavailable or unidentified result.',
};

/** Confirmed results take priority, including a lost accumulator with games remaining. */
export function resultStatus({ result, playStatus, displayStatus }: ResultState): ResultStatus {
  if (result === 'LOST') return 'CUT';
  if (result === 'WON') return 'WIN';
  if (result === 'VOID' || displayStatus === 'UNAVAILABLE') return 'UNKNOWN';
  if (playStatus === 'LIVE') return 'LIVE';
  // A finished game without a confirmed result must never appear open or won.
  if (playStatus === 'PLAYED' || playStatus === 'ALL_PLAYED' || playStatus === 'CUT') return 'UNKNOWN';
  if (result === 'PENDING' || playStatus === 'OPEN' || playStatus === 'UPCOMING') return 'OPEN';
  return 'UNKNOWN';
}

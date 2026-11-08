import type { SelectionSettlement } from '@myodd/shared';
import type { LegPlayStatus } from '@prisma/client';

export type LegMatchPhase = 'prematch' | 'live' | 'finished' | 'unknown';

export type LegPlayDecisionInput = {
  phase: LegMatchPhase;
  /** Explicit settlement from share JSON or scrape. */
  settlement: SelectionSettlement;
  /** Prematch-only: selection removed from the ticket before kickoff. */
  unavailablePrematch: boolean;
  score?: string | null;
  matchLabel: string;
  pickLabel: string;
};

export type LegPlayDecision = {
  playStatus: LegPlayStatus;
  playNote: string;
};

/**
 * Settlement/phase-first leg status.
 * Confirmed completion → PLAYED. Settlement is stored separately from play state.
 */
export function decideLegPlayStatus(input: LegPlayDecisionInput): LegPlayDecision {
  const { phase, settlement, unavailablePrematch, score, matchLabel, pickLabel } = input;
  const scoreSuffix = score ? ` (${score})` : '';

  if (settlement === 'WON') {
    return {
      playStatus: 'PLAYED',
      playNote: `Won · ${matchLabel}${scoreSuffix} · ${pickLabel}`,
    };
  }
  if (settlement === 'LOST') {
    return {
      playStatus: 'PLAYED',
      playNote: `Lost · ${matchLabel}${scoreSuffix} · ${pickLabel}`,
    };
  }
  if (settlement === 'VOID') {
    return {
      playStatus: 'PLAYED',
      playNote: `Void · ${matchLabel}${scoreSuffix} · ${pickLabel}`,
    };
  }

  if (phase === 'prematch') {
    if (unavailablePrematch) {
      return {
        playStatus: 'UNKNOWN',
        playNote: `Awaiting confirmation · ${matchLabel} · ${pickLabel} unavailable before kickoff`,
      };
    }
    return { playStatus: 'UPCOMING', playNote: 'Not kicked off yet' };
  }

  if (phase === 'live') {
    return {
      playStatus: 'LIVE',
      playNote: `In play${score ? ` · ${score}` : ''}`,
    };
  }

  if (phase === 'finished') {
    return {
      playStatus: 'PLAYED',
      playNote: `Finished${scoreSuffix} · ${pickLabel}`,
    };
  }

  return {
    playStatus: 'UNKNOWN',
    playNote: 'Could not confirm play state',
  };
}

export function finishedStatus(matchStatus: string) {
  const value = matchStatus.toLowerCase().trim();
  return ['ended', 'finished', 'ft', 'aet', 'pen', 'closed', 'final', 'complete', 'completed',
    'full time', 'full-time', 'after extra time', 'after penalties'].includes(value);
}

export function liveStatus(matchStatus: string) {
  const value = matchStatus.toLowerCase().trim();
  return ['live', 'inplay', 'in play', '1st', '2nd', 'ht', 'half', 'halftime', 'half time',
    'first half', 'second half', '1st half', '2nd half'].includes(value);
}

export function matchPhase(args: {
  kickoffMs: number | null;
  nowMs: number;
  matchStatus?: string | null;
}): LegMatchPhase {
  const { kickoffMs, nowMs, matchStatus } = args;
  if (matchStatus && finishedStatus(matchStatus)) return 'finished';
  if (matchStatus && liveStatus(matchStatus)) return 'live';
  if (kickoffMs != null && kickoffMs > nowMs + 2 * 60_000) return 'prematch';
  return 'unknown';
}

/** Legacy CUT rows count as done. */
export function isDoneLeg(status: LegPlayStatus | string | null | undefined) {
  return status === 'PLAYED' || status === 'CUT';
}

/** Legacy CUT / ALL_PLAYED rows count as done. */
export function isDoneSlip(status: string | null | undefined) {
  return status === 'ALL_PLAYED' || status === 'CUT';
}

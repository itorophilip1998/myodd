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
 * Settlement-first leg status. Never treats post-kickoff bettability (`isActive`) as a loss.
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
      playStatus: 'CUT',
      playNote: `Lost · ${matchLabel}${scoreSuffix} · ${pickLabel}`,
    };
  }
  if (settlement === 'VOID') {
    return {
      playStatus: 'CUT',
      playNote: `Void · ${matchLabel}${scoreSuffix} · ${pickLabel}`,
    };
  }

  if (phase === 'prematch') {
    if (unavailablePrematch) {
      return {
        playStatus: 'CUT',
        playNote: `Cut · ${matchLabel} · ${pickLabel} unavailable before kickoff`,
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
    // Finished without explicit settlement — do not invent a loss from inactive markets.
    return {
      playStatus: 'UNKNOWN',
      playNote: `Finished${scoreSuffix} · settlement not confirmed for ${pickLabel}`,
    };
  }

  return {
    playStatus: 'UNKNOWN',
    playNote: 'Could not confirm play state',
  };
}

export function finishedStatus(matchStatus: string) {
  const value = matchStatus.toLowerCase();
  return /ended|finished|ft|aet|pen|closed|final|complete/.test(value) || value === '3' || value === '100';
}

export function liveStatus(matchStatus: string) {
  const value = matchStatus.toLowerCase();
  return value === '1' || /live|inplay|in play|1st|2nd|ht|half/.test(value);
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
  if (kickoffMs != null && kickoffMs <= nowMs && kickoffMs > nowMs - 3 * 3600_000) return 'live';
  if (kickoffMs != null && kickoffMs <= nowMs - 3 * 3600_000) return 'finished';
  return 'unknown';
}

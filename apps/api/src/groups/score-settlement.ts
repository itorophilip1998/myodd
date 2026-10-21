import { SPORTYBET_MARKET_IDS, type SelectionSettlement } from '@myodd/shared';
import type { MatchEvidence } from './football-results.service';

/** Standard 90-minute football markets only, using the saved exact market and line. */
export function settlementFromScore(leg: { marketId: string; outcomeId: string; specifier: string; marketName?: string }, match: MatchEvidence): SelectionSettlement {
  if (match.provider !== 'BBC_SPORT' || match.phase !== 'finished' || !match.regularTimeScore) return 'UNKNOWN';
  const { home, away } = match.regularTimeScore;
  if (![home, away].every(n => Number.isInteger(n) && n >= 0)) return 'UNKNOWN';
  // Extra/first-half, special and statistical markets must never use a full-time score.
  if (/half|minute|extra|penalt|corner|card|player|handicap/i.test(leg.marketName ?? '')) return 'UNKNOWN';
  let won: boolean | undefined;
  if (leg.marketId === SPORTYBET_MARKET_IDS.MATCH_RESULT && !leg.specifier) {
    won = ({ '1': home > away, '2': home === away, '3': away > home } as Record<string, boolean>)[leg.outcomeId];
  } else if (leg.marketId === SPORTYBET_MARKET_IDS.DOUBLE_CHANCE && !leg.specifier) {
    won = ({ '9': home >= away, '10': home !== away, '11': away >= home } as Record<string, boolean>)[leg.outcomeId];
  } else if (leg.marketId === SPORTYBET_MARKET_IDS.BTTS && !leg.specifier) {
    won = ({ '74': home > 0 && away > 0, '76': home === 0 || away === 0 } as Record<string, boolean>)[leg.outcomeId];
  } else if (leg.marketId === SPORTYBET_MARKET_IDS.OVER_UNDER) {
    // Half-goal lines avoid push/Asian quarter-line settlement rules.
    const line = leg.specifier.match(/^total=(\d+\.5)$/);
    if (line) {
      const total = Number(line[1]);
      if (!Number.isFinite(total)) return 'UNKNOWN';
      won = leg.outcomeId === '12' ? home + away > total : leg.outcomeId === '13' ? home + away < total : undefined;
    }
  }
  return typeof won !== 'boolean' ? 'UNKNOWN' : won ? 'WON' : 'LOST';
}

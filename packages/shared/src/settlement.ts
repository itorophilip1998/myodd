import type { SelectionSettlement } from './types';

/** Map SportyBet / scrape status strings onto a settlement enum. */
export function inferSettlementFromStatus(raw: unknown): SelectionSettlement {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s) return 'UNKNOWN';
  if (
    /\b(won|win|winning|success|settled[_-]?win|correct|hit)\b/.test(s)
    || s === '2'
    || s === 'w'
    || s === 'win'
  ) {
    return 'WON';
  }
  if (
    /\b(lost|lose|losing|fail|settled[_-]?lose|incorrect|miss)\b/.test(s)
    || s === '3'
    || s === 'l'
    || s === 'lose'
    || s === 'lost'
  ) {
    return 'LOST';
  }
  if (/\b(void|push|refund|cancel|cancelled|canceled|voided|dead.?heat)\b/.test(s) || s === '4' || s === 'v') {
    return 'VOID';
  }
  if (
    /\b(pending|open|active|unsettle|running|not.?result|waiting|live)\b/.test(s)
    || s === '0'
    || s === '1'
    || s === 'suspended'
  ) {
    return 'PENDING';
  }
  return 'UNKNOWN';
}

export function settlementKey(parts: {
  eventId: string;
  marketId: string;
  outcomeId: string;
  specifier?: string;
}) {
  return `${parts.eventId}|${parts.marketId}|${parts.outcomeId}|${parts.specifier ?? ''}`;
}

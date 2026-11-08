import type { SelectionSettlement } from './types';

/** Only explicit, unambiguous settlement labels are evidence. Numeric codes need
 * a documented endpoint-specific mapping; generic status codes are not results. */
export function inferSettlementFromStatus(raw: unknown): SelectionSettlement {
  if (typeof raw !== 'string') return 'UNKNOWN';
  const value = raw.toLowerCase().trim();
  if (['won', 'win', 'settled_win', 'settled-win'].includes(value)) return 'WON';
  if (['lost', 'loss', 'lose', 'settled_lose', 'settled-lose', 'settled_loss'].includes(value)) return 'LOST';
  if (['void', 'voided', 'push', 'refund'].includes(value)) return 'VOID';
  if (['pending', 'open', 'running', 'unsettled'].includes(value)) return 'PENDING';
  return 'UNKNOWN';
}

/** A standard accumulator: unknown evidence can never establish a win. */
export function aggregateSettlement(results: SelectionSettlement[]): SelectionSettlement {
  if (!results.length) return 'UNKNOWN';
  if (results.includes('LOST')) return 'LOST';
  if (results.includes('UNKNOWN')) return 'UNKNOWN';
  if (results.includes('PENDING')) return 'PENDING';
  return results.every(result => result === 'VOID') ? 'VOID' : 'WON';
}

export function hasSettlementConflict(...values: unknown[]): boolean {
  const final = values.map(inferSettlementFromStatus).filter(r => ['WON', 'LOST', 'VOID'].includes(r));
  return new Set(final).size > 1;
}

/** Conflicting explicit fields require review rather than picking the first. */
export function explicitSettlement(...values: unknown[]): SelectionSettlement {
  const results = values.map(inferSettlementFromStatus);
  const final = [...new Set(results.filter(r => ['WON', 'LOST', 'VOID'].includes(r)))];
  if (final.length > 1) return 'UNKNOWN';
  return final[0] ?? (results.includes('PENDING') ? 'PENDING' : 'UNKNOWN');
}

export function settlementKey(parts: {
  eventId: string;
  marketId: string;
  outcomeId: string;
  specifier?: string;
}) {
  return `${parts.eventId}|${parts.marketId}|${parts.outcomeId}|${parts.specifier ?? ''}`;
}

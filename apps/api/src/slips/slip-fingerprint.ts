import { createHash } from 'crypto';
import type { BookmakerSelection, ScoredSelection } from '@myodd/shared';

export function slipFingerprint(selections: BookmakerSelection[]): string {
  const parts = selections
    .map(
      (s) =>
        `${s.eventId}|${s.marketId}|${s.outcomeId}|${s.specifier ?? ''}`,
    )
    .sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

export function scoreSlip(selections: ScoredSelection[]): number {
  if (selections.length === 0) return 0;
  const avg =
    selections.reduce((sum, s) => sum + s.confidence, 0) / selections.length;

  const eventIds = new Set(selections.map((s) => s.eventId));
  const correlationPenalty =
    selections.length - eventIds.size > 0
      ? (selections.length - eventIds.size) * 12
      : 0;

  const volatilities = selections.map((s) => s.odds ?? 1);
  const maxOdd = Math.max(...volatilities);
  const volatilityPenalty = maxOdd > 3 ? (maxOdd - 3) * 4 : 0;

  const excessiveLegPenalty =
    selections.length > 7 ? (selections.length - 7) * 3 : 0;

  return (
    Math.round(
      (avg - correlationPenalty - volatilityPenalty - excessiveLegPenalty) * 10,
    ) / 10
  );
}

/** Build an immutable pre-match forecast and a correctable, independently verified label. */
export type ForecastLeg = {
  id: string; sportyEventId: string; marketId: string; outcomeId: string; specifier: string;
  kickoffAt: Date | null; predictedAt?: Date | null; predictionProbability?: number;
  baseProbability?: number | null; modelVersion?: string; baseModelVersion?: string | null;
  predictionMode?: string | null; odds?: number; marketName?: string; league?: string;
  result?: string; matchPhase?: string;
};
const SOURCES = new Set(['SPORTYBET_SHARE_JSON', 'SPORTYBET_SHARE_PAGE', 'BBC_SPORT_SCORE']);
export function observation(leg: ForecastLeg, slipId: string, result: string, source: string | null,
  phase: string, conflict: boolean, checkedAt: Date, ticketSize: number) {
  const probability = leg.predictionProbability, baseProbability = leg.baseProbability;
  if (!leg.predictedAt || !leg.kickoffAt || leg.predictedAt >= leg.kickoffAt || !leg.modelVersion || !leg.baseModelVersion
    || !Number.isFinite(probability) || probability! <= 0 || probability! >= 1
    || !Number.isFinite(baseProbability) || baseProbability! <= 0 || baseProbability! >= 1
    || !Number.isFinite(leg.odds) || leg.odds! <= 1 || checkedAt < leg.kickoffAt) return null;
  const verified = !conflict && phase === 'finished' && SOURCES.has(source ?? '') && ['WON', 'LOST', 'VOID'].includes(result);
  const label = { result, resultSource: source, verified, checkedAt };
  return {
    where: { id: leg.id },
    create: { id: leg.id, slipId, ticketSize, eventId: leg.sportyEventId, marketId: leg.marketId, outcomeId: leg.outcomeId,
      specifier: leg.specifier, marketName: leg.marketName ?? '', league: leg.league ?? '', mode: leg.predictionMode ?? null,
      odds: leg.odds!, probability: probability!, baseProbability: baseProbability!, modelVersion: leg.modelVersion,
      baseModelVersion: leg.baseModelVersion, predictedAt: leg.predictedAt, kickoffAt: leg.kickoffAt,
      resultKnownAt: checkedAt, ...label },
    // A repeated result check must not move the first-known result time into the future.
    update: { ...label, ...(leg.result !== result || leg.matchPhase !== phase ? { resultKnownAt: checkedAt } : {}) },
  };
}

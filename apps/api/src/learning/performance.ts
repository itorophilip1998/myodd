/** Outcome metrics for immutable pre-match forecasts; repeated bets count once. */
export interface ObservationRow {
  id: string; slipId: string; ticketSize: number; eventId: string; marketId: string; outcomeId: string; specifier: string;
  marketName: string; league: string; mode: string | null; probability: number; baseProbability: number;
  modelVersion: string; baseModelVersion: string; predictedAt: Date; kickoffAt: Date; resultKnownAt: Date;
  result: string; resultSource: string | null; verified: boolean;
}
const SOURCES = new Set(['SPORTYBET_SHARE_JSON', 'SPORTYBET_SHARE_PAGE', 'BBC_SPORT_SCORE']);
export function validOutcome(row: ObservationRow, now = new Date()) {
  return row.verified && SOURCES.has(row.resultSource ?? '') && ['WON', 'LOST'].includes(row.result)
    && row.predictedAt < row.kickoffAt && row.kickoffAt <= row.resultKnownAt && row.resultKnownAt <= now
    && [row.probability, row.baseProbability].every(p => Number.isFinite(p) && p > 0 && p < 1);
}
export function uniqueOutcomes(rows: ObservationRow[], now = new Date()) {
  const ordered = [...rows].sort((a, b) => a.predictedAt.getTime() - b.predictedAt.getTime() || a.id.localeCompare(b.id));
  const unique = new Map<string, ObservationRow>();
  const outcomes = new Map<string, Set<string>>();
  for (const row of ordered) {
    const key = JSON.stringify([row.eventId, row.marketId, row.outcomeId, row.specifier]);
    if (row.verified && SOURCES.has(row.resultSource ?? '') && row.resultKnownAt <= now && ['WON', 'LOST', 'VOID'].includes(row.result)) {
      const results = outcomes.get(key) ?? new Set<string>(); results.add(row.result); outcomes.set(key, results);
    }
    if (!validOutcome(row, now)) continue;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique].filter(([key]) => outcomes.get(key)?.size === 1).map(([, row]) => row);
}
function metrics(rows: ObservationRow[], base = false) {
  if (!rows.length) return { samples: 0, matches: 0, wins: 0, losses: 0, winRate: null, brier: null, logLoss: null, meanProbability: null };
  let wins = 0, brier = 0, logLoss = 0, sum = 0;
  for (const row of rows) {
    const y = row.result === 'WON' ? 1 : 0;
    const p = base ? row.baseProbability : row.probability;
    wins += y; sum += p; brier += (p - y) ** 2;
    logLoss -= Math.log(y ? p : 1 - p);
  }
  return { samples: rows.length, matches: new Set(rows.map(r => r.eventId)).size,
    wins, losses: rows.length - wins, winRate: wins / rows.length, brier: brier / rows.length,
    logLoss: logLoss / rows.length, meanProbability: sum / rows.length };
}
function breakdown(rows: ObservationRow[], key: (row: ObservationRow) => string) {
  const groups = new Map<string, ObservationRow[]>();
  for (const row of rows) { const name = key(row); const group = groups.get(name) ?? []; group.push(row); groups.set(name, group); }
  return [...groups].map(([name, group]) => ({ name, ...metrics(group) })).sort((a, b) => b.samples - a.samples);
}
function ticketMetrics(rows: ObservationRow[], now: Date) {
  const groups = new Map<string, ObservationRow[]>();
  for (const row of rows) groups.set(row.slipId, [...(groups.get(row.slipId) ?? []), row]);
  let won = 0, lost = 0, voided = 0, awaiting = 0;
  for (const group of groups.values()) {
    if (group.length !== group[0].ticketSize || group.some(r => !r.verified || !SOURCES.has(r.resultSource ?? '')
      || r.predictedAt >= r.kickoffAt || r.resultKnownAt > now || !['WON', 'LOST', 'VOID'].includes(r.result))) { awaiting++; continue; }
    if (group.some(r => r.result === 'LOST')) lost++;
    else if (group.every(r => r.result === 'VOID')) voided++;
    else won++;
  }
  return { won, lost, void: voided, awaitingVerification: awaiting, winRate: won + lost ? won / (won + lost) : null };
}
export function performanceReport(observations: ObservationRow[], now = new Date()) {
  const rows = uniqueOutcomes(observations, now);
  return {
    observedAt: now.toISOString(), scope: 'Generated-ticket selections; last 90 days, up to 10000 stored observations.',
    tickets: ticketMetrics(observations, now), overall: metrics(rows), baseline: metrics(rows, true),
    byModel: breakdown(rows, r => r.modelVersion), byMode: breakdown(rows, r => r.mode ?? 'CUSTOM'),
    byMarket: breakdown(rows, r => `${r.marketId}: ${r.marketName}`),
    calibration: Array.from({ length: 10 }, (_, index) => {
      const group = rows.filter(r => Math.min(9, Math.floor(r.probability * 10)) === index);
      return { minimum: index / 10, maximum: (index + 1) / 10, ...metrics(group) };
    }),
    excluded: { observations: observations.length - rows.length,
      unverifiedOrPending: observations.filter(r => !r.verified || !['WON', 'LOST', 'VOID'].includes(r.result)).length,
      void: observations.filter(r => r.verified && r.result === 'VOID').length },
  };
}

/** Session-scoped basket of prediction picks for booking on the create page. */

export interface PredictionBookPick {
  eventId: string;
  marketId: string;
  outcomeId: string;
  specifier: string;
  odds: number;
  marketName: string;
  selectionName: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffAt: string;
  probability?: number;
}

const KEY = 'myodd-prediction-book-v1';
const MAX_PICKS = 30;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

export function pickKey(pick: Pick<PredictionBookPick, 'eventId' | 'marketId' | 'outcomeId' | 'specifier'>) {
  return `${pick.eventId}:${pick.marketId}:${pick.outcomeId}:${pick.specifier ?? ''}`;
}

export function readPredictionBook(): PredictionBookPick[] {
  if (!canUseStorage()) return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PredictionBookPick[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p?.eventId && p?.marketId && p?.outcomeId).slice(0, MAX_PICKS);
  } catch {
    return [];
  }
}

export function writePredictionBook(picks: PredictionBookPick[]) {
  if (!canUseStorage()) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(picks.slice(0, MAX_PICKS)));
    window.dispatchEvent(new CustomEvent('myodd:prediction-book', { detail: picks.slice(0, MAX_PICKS) }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearPredictionBook() {
  writePredictionBook([]);
}

/** One pick per event — adding another market for the same match replaces the previous. */
export function upsertPredictionBookPick(pick: PredictionBookPick): PredictionBookPick[] {
  const next = readPredictionBook().filter((p) => p.eventId !== pick.eventId);
  next.push(pick);
  writePredictionBook(next);
  return next;
}

export function removePredictionBookPick(eventId: string): PredictionBookPick[] {
  const next = readPredictionBook().filter((p) => p.eventId !== eventId);
  writePredictionBook(next);
  return next;
}

export function isInPredictionBook(eventId: string, outcome?: Pick<PredictionBookPick, 'marketId' | 'outcomeId' | 'specifier'>) {
  const book = readPredictionBook();
  const match = book.find((p) => p.eventId === eventId);
  if (!match) return false;
  if (!outcome) return true;
  return pickKey(match) === pickKey({ eventId, ...outcome });
}

export function predictionBookPrompt(picks: PredictionBookPick[]) {
  if (!picks.length) return '';
  const lines = picks.map((p, i) => {
    const pct = p.probability != null ? ` (~${(p.probability * 100).toFixed(0)}%)` : '';
    return `${i + 1}. ${p.homeTeam} vs ${p.awayTeam} — ${p.marketName}: ${p.selectionName} @ ${p.odds}${pct}`;
  });
  return [
    `Book these myOdd prediction picks exactly. Keep the original selections. Original matches only.`,
    ...lines,
  ].join('\n');
}

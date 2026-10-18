/** Lowest accepted price for any single selection / game leg. */
export const MIN_SELECTION_ODDS = 1.1;

/** Hard ceiling for combined ticket odds in UI preflight (Lagoslife may still use “no max” inside mode bands below this). */
export const MAX_TICKET_ODDS = 10_000;

/** Best-effort parse of ticket odds from a free-text prompt for preflight checks. */
export function previewOddsFromPrompt(instruction: string): { minimum: number; maximum: number | null } | null {
  const text = instruction.trim();
  if (!text) return null;
  const between = text.match(/\b(?:between|from)\s+(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*(\d+(?:\.\d+)?)\b/i);
  if (between) {
    const minimum = Number(between[1]);
    const maximum = Number(between[2]);
    if (Number.isFinite(minimum) && Number.isFinite(maximum)) return { minimum, maximum };
  }
  const around = text.match(/\b(?:around|about|~)\s*(\d+(?:\.\d+)?)\b/i);
  if (around) {
    const mid = Number(around[1]);
    if (Number.isFinite(mid)) return { minimum: mid * 0.9, maximum: mid * 1.1 };
  }
  const minOnly = text.match(/\b(?:min(?:imum)?|at\s*least)\s*(\d+(?:\.\d+)?)\b/i);
  const maxOnly = text.match(/\b(?:max(?:imum)?|up\s*to|under|below)\s*(\d+(?:\.\d+)?)\b/i);
  if (minOnly || maxOnly) {
    const minimum = minOnly ? Number(minOnly[1]) : 1;
    const maximum = maxOnly ? Number(maxOnly[1]) : null;
    if (Number.isFinite(minimum) && (maximum == null || Number.isFinite(maximum))) return { minimum, maximum };
  }
  return null;
}

/** Ticket (combined) odds bands for named modes. */
export const MODE_ODDS = {
  INVESTOR: { minimum: 2, maximum: 5 },
  GAMBLER: { minimum: 5.01, maximum: 20 },
  JAPA: { minimum: 20.01, maximum: 100 },
  LAGOS_LIFE: { minimum: 100.01, maximum: null },
} as const;

/**
 * Safe per-game / per-leg odds inside a ticket for named modes.
 * Ticket totals still use MODE_ODDS; these bounds keep individual picks in a safer band.
 */
export const MODE_SELECTION_ODDS = {
  INVESTOR: { minimum: MIN_SELECTION_ODDS, maximum: 1.5 },
  GAMBLER: { minimum: MIN_SELECTION_ODDS, maximum: 1.8 },
  JAPA: { minimum: MIN_SELECTION_ODDS, maximum: 2 },
  LAGOS_LIFE: { minimum: MIN_SELECTION_ODDS, maximum: 2 },
} as const;

export function withinModeOdds(odds: number, mode?: string | null) {
  if (!Number.isFinite(odds)) return false;
  if (!mode) return true;
  const bounds = MODE_ODDS[mode as keyof typeof MODE_ODDS];
  return !!bounds && odds >= bounds.minimum && (bounds.maximum === null || odds <= bounds.maximum);
}

export function selectionOddsBounds(mode?: string | null) {
  if (!mode) return { minimum: MIN_SELECTION_ODDS, maximum: null as number | null };
  const bounds = MODE_SELECTION_ODDS[mode as keyof typeof MODE_SELECTION_ODDS];
  return bounds ? { minimum: bounds.minimum, maximum: bounds.maximum as number | null } : { minimum: MIN_SELECTION_ODDS, maximum: null };
}

export function withinModeSelectionOdds(odds: number, mode?: string | null) {
  if (!Number.isFinite(odds)) return false;
  const { minimum, maximum } = selectionOddsBounds(mode);
  return odds >= minimum && (maximum === null || odds <= maximum);
}

export type ModeKey = keyof typeof MODE_ODDS;

export function modeKeyFromLabel(label?: string | null): ModeKey | null {
  if (!label) return null;
  const text = label.toLowerCase();
  if (text in MODE_ODDS) return text as ModeKey;
  if (/\binvestor\b/.test(text)) return 'INVESTOR';
  if (/\bgam(?:b)?ler\b/.test(text)) return 'GAMBLER';
  if (/\bjapa\b/.test(text)) return 'JAPA';
  if (/\blagos/.test(text)) return 'LAGOS_LIFE';
  return null;
}

/** Clamp a requested ticket-odds window into a named mode band. */
export function clampOddsToMode(
  minimum: number,
  maximum: number | null | undefined,
  mode?: string | null,
) {
  const key = (mode && mode in MODE_ODDS ? mode : modeKeyFromLabel(mode)) as ModeKey | null;
  const band = key ? MODE_ODDS[key] : null;
  let min = Number.isFinite(minimum) ? minimum : band?.minimum ?? MIN_SELECTION_ODDS;
  let max = maximum == null || !Number.isFinite(maximum) ? (band?.maximum ?? null) : maximum;
  if (band) {
    min = Math.max(band.minimum, min);
    if (band.maximum != null) max = max == null ? band.maximum : Math.min(band.maximum, max);
  }
  if (max != null && min > max) {
    min = band?.minimum ?? min;
    max = band?.maximum ?? max;
  }
  return { minimum: min, maximum: max };
}

import { parseOddsToken } from './format-odds';

/** Lowest accepted price for any single selection / game leg. */
export const MIN_SELECTION_ODDS = 1.1;

/** Preflight ceiling for requests outside Lagoslife Mode, which has no product maximum. */
export const MAX_TICKET_ODDS = 10_000;

/** Best-effort parse of ticket odds from a free-text prompt for preflight checks. */
export function previewOddsFromPrompt(instruction: string): { minimum: number; maximum: number | null } | null {
  const text = instruction.trim()
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, value => value.replace(/,/g, ''))
    .replace(/\b\d+(?:\.\d+)?\s*(?:ks?|ms?|b|t|q)\b/gi, value => String(parseOddsToken(value) ?? value));
  if (!text) return null;
  const between = [...text.matchAll(/\b(?:between|from)\s+(\d+(?:\.\d+)?)\s*(?:and|to|[-–])\s*(\d+(?:\.\d+)?)\b/gi)].filter(m => !/^\s*(?:games?|tickets?|matches?|legs?|picks?)\b/i.test(text.slice((m.index ?? 0) + m[0].length))).at(-1)
    ?? [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*odds\b/gi)].at(-1);
  if (between) {
    const minimum = Number(between[1]);
    const maximum = Number(between[2]);
    if (Number.isFinite(minimum) && Number.isFinite(maximum)) return { minimum, maximum };
  }
  const around = text.match(/\b(?:around|about|sure|safe|~)\s*(\d+(?:\.\d+)?)\b/i);
  if (around) {
    const mid = Number(around[1]);
    if (Number.isFinite(mid)) return { minimum: Math.max(1.1, mid - .5), maximum: mid + .5 };
  }
  const minOnly = text.match(/\b(?:min(?:imum)?|at\s*least|from)\s*(\d+(?:\.\d+)?)\b/i);
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
  /** Week-range Aries card; combined ticket band 4–6. */
  OVER15_MACHINE: { minimum: 4, maximum: 6 },
  GOALS_DESK_V2: { minimum: 3, maximum: 6 },
  /** GGSP v1.1 Chaldean CLEAN O1.5; day by default; tickets 3–4. */
  GGSP_V11: { minimum: 3, maximum: 4 },
  INVESTOR: { minimum: 3, maximum: 6 },
  GAMBLER: { minimum: 6.1, maximum: 20 },
  JAPA: { minimum: 20.01, maximum: 100 },
  LAGOS_LIFE: { minimum: 100, maximum: null },
} as const;

/**
 * Safe per-game / per-leg odds inside a ticket for named modes.
 * Ticket totals still use MODE_ODDS; these bounds keep individual picks in a safer band.
 *
 * Investor / Gambler default leg max is 1.35. Corners, shots / SOT, and 1·over / 2·over
 * (Home/Away or Over 2.5) may go up to {@link INVESTOR_EXTENDED_LEG_ODDS_MAX}.
 */
export const INVESTOR_EXTENDED_LEG_ODDS_MAX = 1.45;
/** Match Over 1.5 goals — Investor/Gambler leg max. */
export const O15_LEG_ODDS_MAX = 1.27;

export const MODE_SELECTION_ODDS = {
  OVER15_MACHINE: { minimum: MIN_SELECTION_ODDS, maximum: 1.25 },
  /** 1.09 kept so cheap O1.5 can convert to Asian Over 2 on the O1.5 ticket lane. */
  GOALS_DESK_V2: { minimum: 1.09, maximum: 1.60 },
  /** 1.09 kept so cheap O1.5 can convert to Asian Over 2. */
  GGSP_V11: { minimum: 1.09, maximum: 1.30 },
  INVESTOR: { minimum: MIN_SELECTION_ODDS, maximum: 1.35 },
  GAMBLER: { minimum: MIN_SELECTION_ODDS, maximum: 1.35 },
  JAPA: { minimum: MIN_SELECTION_ODDS, maximum: 2 },
  LAGOS_LIFE: { minimum: MIN_SELECTION_ODDS, maximum: 2 },
} as const;

/** Corners, shots/SOT, Home or Over 2.5, Away or Over 2.5 — Investor/Gambler leg max 1.45. */
export function isExtendedLegOddsMarket(marketName = '', outcomeName = '') {
  const name = `${marketName} ${outcomeName}`.toLowerCase();
  if (/\bcorners?\b/.test(name)) return true;
  if (/\bshots?\b/.test(name)) return true;
  // 1/over or 2/over — not draw/over, not team Over 0.5
  if (/\bor\b/.test(name) && /\bover\b/.test(name) && /2\.5/.test(name) && !/\bdraw\b/.test(name)) return true;
  return false;
}

/** Match totals Over 1.5 — not team / club-titled goals, corners, shots, or 1·over. */
export function isMatchGoalsOver15(marketName = '', outcomeName = '') {
  const market = marketName.toLowerCase().replace(/\s+/g, ' ').trim();
  const outcome = outcomeName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!/^over/.test(outcome)) return false;
  if (!/^(?:over\/?under|total(?:\s+goals)?)$/.test(market)) return false;
  const line = Number(/(\d+(?:\.\d+)?)/.exec(outcome)?.[1]);
  return line === 1.5;
}

export function withinModeOdds(odds: number, mode?: string | null) {
  if (!Number.isFinite(odds)) return false;
  if (!mode) return true;
  const bounds = MODE_ODDS[mode as keyof typeof MODE_ODDS];
  return !!bounds && odds >= bounds.minimum && (bounds.maximum === null || odds <= bounds.maximum);
}

export function selectionOddsBounds(mode?: string | null, marketName = '', outcomeName = '') {
  if (!mode) return { minimum: MIN_SELECTION_ODDS, maximum: null as number | null };
  const bounds = MODE_SELECTION_ODDS[mode as keyof typeof MODE_SELECTION_ODDS];
  if (!bounds) return { minimum: MIN_SELECTION_ODDS, maximum: null };
  let maximum: number | null = bounds.maximum;
  if ((mode === 'INVESTOR' || mode === 'GAMBLER') && isExtendedLegOddsMarket(marketName, outcomeName)) {
    maximum = INVESTOR_EXTENDED_LEG_ODDS_MAX;
  }
  if ((mode === 'INVESTOR' || mode === 'GAMBLER') && isMatchGoalsOver15(marketName, outcomeName)) {
    maximum = maximum == null ? O15_LEG_ODDS_MAX : Math.min(maximum, O15_LEG_ODDS_MAX);
  }
  return { minimum: bounds.minimum, maximum };
}

export function withinModeSelectionOdds(odds: number, mode?: string | null, marketName = '', outcomeName = '') {
  if (!Number.isFinite(odds)) return false;
  const { minimum, maximum } = selectionOddsBounds(mode, marketName, outcomeName);
  return odds >= minimum && (maximum === null || odds <= maximum);
}

export type ModeKey = keyof typeof MODE_ODDS;

export function modeKeyFromLabel(label?: string | null): ModeKey | null {
  if (!label) return null;
  const text = label.toLowerCase();
  if (text in MODE_ODDS) return text as ModeKey;
  if (/\bover\s*1\.?5\s*machine\b/.test(text)) return 'OVER15_MACHINE';
  if (/\bgoals?\s*desk\s*v?2\b/.test(text)) return 'GOALS_DESK_V2';
  if (/\bggsp(?:\s*v?1\.?1)?\b/.test(text) || /\bgematria\b/.test(text)) return 'GGSP_V11';
  if (/\binvestor\b/.test(text)) return 'INVESTOR';
  // Legacy “Statsman Mode” label → Investor (engine lives inside Investor/Gambler/Japa/Lagos).
  if (/\bstatsman\b/.test(text)) return 'INVESTOR';
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

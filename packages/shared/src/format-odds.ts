/** Compact display only; calculations and stored prices retain their full value. */
const SUFFIXES = ['', 'k', 'm', 'b', 't', 'q'] as const;
const PARSE_MULT: Record<string, number> = {
  '': 1,
  k: 1e3,
  ks: 1e3,
  m: 1e6,
  ms: 1e6,
  b: 1e9,
  t: 1e12,
  q: 1e15,
};

export function formatOdds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1000) return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
  if (value >= 1e18) return value.toExponential(1).replace('.0e', 'e').replace('e+', 'e');
  let unit = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(value) / 3));
  let rounded = Math.round(value / 1000 ** unit);
  if (rounded === 1000 && unit < SUFFIXES.length - 1) {
    unit++;
    rounded = 1;
  }
  return `${rounded}${SUFFIXES[unit]}`;
}

export function exactOdds(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value) : 'Unavailable';
}

/** Parse plain or compact odds tokens such as `5`, `20ks`, `1.5ms`, `2k`, `1m`. */
export function parseOddsToken(raw: string): number | null {
  const match = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*(ks?|ms?|b|t|q)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const mult = PARSE_MULT[(match[2] ?? '').toLowerCase()] ?? 1;
  const parsed = value * mult;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

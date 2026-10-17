/** Compact display only; calculations and stored prices retain their full value. */
export function formatOdds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1000) return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
  if (value >= 1e18) return value.toExponential(1).replace('.0e', 'e').replace('e+', 'e');
  const suffixes = ['', 'k', 'm', 'b', 't', 'q'];
  let unit = Math.min(suffixes.length - 1, Math.floor(Math.log10(value) / 3));
  let rounded = Math.round(value / 1000 ** unit);
  if (rounded === 1000 && unit < suffixes.length - 1) { unit++; rounded = 1; }
  return `${rounded}${suffixes[unit]}`;
}

export function exactOdds(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value) : 'Unavailable';
}

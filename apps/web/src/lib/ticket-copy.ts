import { MODE_ODDS, type ModeKey } from '@myodd/shared';
import { modeTag } from '@/lib/mode-label';

/** Mode band for the title, e.g. `2–5` or `35–50`. */
export function modeOddsRangeLabel(mode?: string | null): string | null {
  if (!mode || !(mode in MODE_ODDS)) return null;
  const band = MODE_ODDS[mode as ModeKey];
  return `${band.minimum}–${band.maximum}`;
}

/** Title line: `Investor Mode · 2–5 odds` */
export function ticketCopyTitle(mode?: string | null): string {
  const name = modeTag(mode);
  const range = modeOddsRangeLabel(mode);
  if (name && range) return `${name} Mode · ${range} odds`;
  if (name) return `${name} Mode`;
  if (range) return `${range} odds`;
  return 'myOdd ticket';
}

/** One ticket: title, then booking code. */
export function formatTicketCopy(
  slip: { bookingCode: string; riskMode?: string | null },
  fallbackMode?: string | null,
): string {
  return `${ticketCopyTitle(slip.riskMode ?? fallbackMode)}\n${slip.bookingCode}`;
}

/**
 * Collection copy:
 * Investor Mode · 2–5 odds
 * ABC12XYZ
 * ABC12XY3
 */
export function formatTicketsCopy(
  slips: Array<{ bookingCode: string; riskMode?: string | null }>,
  fallbackMode?: string | null,
): string {
  const mode = slips[0]?.riskMode ?? fallbackMode ?? null;
  const codes = slips.map(slip => slip.bookingCode).filter(Boolean);
  return [ticketCopyTitle(mode), ...codes].join('\n');
}

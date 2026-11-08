import { api } from '@/lib/api';

/** SportyBet booking load URL — opens/overrides the betslip with this code. */
export function sportyLoadUrl(code: string, shareUrl?: string | null) {
  const trimmed = shareUrl?.trim();
  if (trimmed && /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://www.sportybet.com/ng/?shareCode=${encodeURIComponent(code.trim().toUpperCase())}`;
}

/**
 * Open SportyBet and load the booking code (replaces any slip already open).
 * Opens the tab synchronously so popup blockers do not kill the flow.
 */
export async function loadTicketOnSportyBet(code: string, shareUrl?: string | null) {
  const url = sportyLoadUrl(code, shareUrl);
  const target = window.open(url, '_blank');
  if (target) target.opener = null;

  try {
    const checked = await api.verifyCode(code);
    const upper = code.trim().toUpperCase();
    if (!checked.codes.includes(upper) && !checked.codes.includes(code)) {
      target?.close();
      throw new Error('This code is no longer available.');
    }
  } catch (error) {
    if (error instanceof Error && /no longer available/i.test(error.message)) throw error;
    // Network/verify hiccup: leave the SportyBet tab open with the load URL.
    if (!target) {
      try { window.location.assign(url); } catch { /* ignore */ }
    }
  }
}

export function shareTicketText(code: string, selectionCount: number, oddsLabel: string, modeTitle?: string | null) {
  // Keep picks/odds for rich share channels; title still leads when mode is known.
  const body = `${code} · ${selectionCount} picks · ${oddsLabel} odds`;
  return modeTitle ? `${modeTitle}\n${code}` : body;
}

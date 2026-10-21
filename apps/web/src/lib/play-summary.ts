import type { PlaySummary } from './api';

export function formatPlaySummary(summary: PlaySummary): string {
  if (!summary.tickets) return 'No tickets to check.';
  const bits = [
    summary.won ? `${summary.won} won` : '',
    summary.lost ? `${summary.lost} lost` : '',
    summary.void ? `${summary.void} void` : '',
    summary.live ? `${summary.live} live` : '',
    summary.open ? `${summary.open} open` : '',
    summary.done ? `${summary.done} done` : '',
    summary.unknown ? `${summary.unknown} play status not confirmed` : '',
  ].filter(Boolean);
  if (summary.awaitingConfirmation) bits.push(`${summary.awaitingConfirmation} result${summary.awaitingConfirmation === 1 ? '' : 's'} not confirmed`);
  return bits.join(' · ') || 'SportyBet has not confirmed the play status yet.';
}

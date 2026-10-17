import type { BookmakerBooking } from '@myodd/shared';

export const CODE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export function codeExpiry(createdAt: Date, upstream?: string | null) {
  const deadline = upstream ? new Date(upstream).getTime() : Infinity;
  return new Date(Math.min(createdAt.getTime() + CODE_LIFETIME_MS, Number.isFinite(deadline) ? deadline : Infinity));
}

export function assessBooking(booking: BookmakerBooking, firstSeenAt: Date, now = new Date()) {
  const expiresAt = codeExpiry(firstSeenAt, booking.deadline);
  const active = booking.selections.filter(selection => selection.isActive !== false
    && Number.isFinite(selection.odds) && selection.odds! > 1 && selection.kickoffAt
    && new Date(selection.kickoffAt).getTime() > now.getTime());
  return { expiresAt, activeSelections: active.length, totalSelections: booking.selections.length,
    status: expiresAt <= now ? 'EXPIRED' as const : active.length > 0 && active.length === booking.selections.length ? 'ACTIVE' as const : active.length > 0 ? 'PARTIAL' as const : 'INACTIVE' as const };
}

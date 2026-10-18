/** Africa/Lagos is UTC+01:00 year-round (no DST). */
const LAGOS_OFFSET = '+01:00';

/** Calendar date `YYYY-MM-DD` in Africa/Lagos for the given instant. */
export function lagosDateYmd(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addLagosDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utc));
}

function lagosMidnightUtcIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00${LAGOS_OFFSET}`).toISOString();
}

export type MatchDayWindow = {
  matchDate: string;
  /** Inclusive end day when a range is selected; equals `matchDate` for a single day. */
  matchDateEnd: string;
  kickoffAfter: string;
  kickoffBefore: string;
  /** True when the selected day is today in Lagos (rolling 24h window). */
  within24Hours: boolean;
  label: string;
};

/**
 * Kickoff window for generation.
 * - Today (default): from now through the next 24 hours.
 * - Another Lagos calendar day: that full day [00:00, next day 00:00).
 * - Optional end day extends the window through that day's end.
 * Past dates clamp to today.
 */
export function matchDayKickoffWindow(
  matchDate?: string | null,
  now = new Date(),
  matchDateEnd?: string | null,
): MatchDayWindow {
  const today = lagosDateYmd(now);
  let day = typeof matchDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(matchDate) ? matchDate : today;
  if (day < today) day = today;
  let end = typeof matchDateEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(matchDateEnd) ? matchDateEnd : day;
  if (end < day) end = day;
  const max = addLagosDays(today, 6);
  if (end > max) end = max;

  if (day === today && end === today) {
    const after = now.toISOString();
    const before = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    return {
      matchDate: day,
      matchDateEnd: end,
      kickoffAfter: after,
      kickoffBefore: before,
      within24Hours: true,
      label: 'today · next 24 hours',
    };
  }
  return {
    matchDate: day,
    matchDateEnd: end,
    kickoffAfter: day === today ? now.toISOString() : lagosMidnightUtcIso(day),
    kickoffBefore: lagosMidnightUtcIso(addLagosDays(end, 1)),
    within24Hours: false,
    label: day === end ? day : `${day} → ${end}`,
  };
}

/** Latest selectable match day (Lagos): today + 6 days. */
export function matchDayMaxYmd(now = new Date()): string {
  return addLagosDays(lagosDateYmd(now), 6);
}

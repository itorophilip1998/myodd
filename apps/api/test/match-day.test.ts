import { expect, it } from 'vitest';
import { lagosDateYmd, matchDayKickoffWindow, matchDayMaxYmd } from '@myodd/shared';

it('defaults to today with a rolling 24-hour kickoff window', () => {
  const now = new Date('2026-10-17T10:00:00.000Z');
  const window = matchDayKickoffWindow(undefined, now);
  expect(window.matchDate).toBe(lagosDateYmd(now));
  expect(window.within24Hours).toBe(true);
  expect(window.kickoffAfter).toBe(now.toISOString());
  expect(window.kickoffBefore).toBe(new Date(now.getTime() + 24 * 3600 * 1000).toISOString());
  expect(window.label).toContain('24 hours');
});

it('uses a full Lagos calendar day for a future selected date', () => {
  const now = new Date('2026-10-17T10:00:00.000Z');
  const window = matchDayKickoffWindow('2026-10-19', now);
  expect(window.within24Hours).toBe(false);
  expect(window.matchDate).toBe('2026-10-19');
  expect(window.kickoffAfter).toBe(new Date('2026-10-19T00:00:00+01:00').toISOString());
  expect(window.kickoffBefore).toBe(new Date('2026-10-20T00:00:00+01:00').toISOString());
});

it('clamps past dates to today and exposes a short selectable range', () => {
  const now = new Date('2026-10-17T22:30:00.000Z');
  const window = matchDayKickoffWindow('2026-10-01', now);
  expect(window.matchDate).toBe(lagosDateYmd(now));
  expect(window.within24Hours).toBe(true);
  expect(matchDayMaxYmd(now) >= lagosDateYmd(now)).toBe(true);
});

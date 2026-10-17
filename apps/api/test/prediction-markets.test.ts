import { describe, expect, it } from 'vitest';
import { matchesPredictionMarket as matches } from '@myodd/shared';
const pick = (marketName: string, selectionName: string, marketId = 'other') => ({ marketName, selectionName, marketId });
describe('prediction market intent', () => {
  it('keeps over and under goal outcomes separate, including alternate lines', () => {
    expect(matches(pick('Over/Under', 'Over 2.5', '18'), 'over')).toBe(true);
    expect(matches(pick('Total Goals - First Half', 'Under 1.5'), 'under')).toBe(true);
    expect(matches(pick('Over/Under', 'Under 2.5', '18'), 'over')).toBe(false);
    expect(matches(pick('Over/Under', 'Over 2.5', '18'), 'under')).toBe(false);
  });
  it('does not confuse corner/card totals with goal totals', () => {
    expect(matches(pick('Total Corners', 'Over 9.5'), 'over')).toBe(false);
    expect(matches(pick('Total Cards', 'Under 4.5'), 'under')).toBe(false);
    expect(matches(pick('Total Corners', 'Under 9.5'), 'corners')).toBe(true);
    expect(matches(pick('Bookings', 'Over 4.5'), 'cards')).toBe(true);
  });
  it('keeps interval draws but excludes double chance and conditional draws', () => {
    expect(matches(pick('1X2', 'Draw', '1'), 'draws')).toBe(true);
    expect(matches(pick('1-10 Minute Result', 'Draw'), 'draws')).toBe(true);
    expect(matches(pick('Double Chance', 'Draw or Away', '10'), 'draws')).toBe(false);
    expect(matches(pick('Result & Total Goals', 'Draw & Under 2.5'), 'draws')).toBe(false);
    expect(matches(pick('Asian Handicap', 'Draw'), 'draws')).toBe(false);
  });
  it('supports other real market families and an unfiltered None choice', () => {
    expect(matches(pick('GG/NG', 'No', '29'), 'btts')).toBe(true);
    expect(matches(pick('Asian Handicap', 'Home (-1)'), 'handicap')).toBe(true);
    expect(matches(pick('Correct Score', '0:0'), 'score')).toBe(true);
    expect(matches(pick('Unclassified market', 'No'), 'all')).toBe(true);
  });
});

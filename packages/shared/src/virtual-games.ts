/** Simulated Reality / SRL listings are virtual games and must never enter tickets. */

const VIRTUAL_GAME = /\bSRL\b|simulated\s+reality/i;

export type NamedFixture = {
  homeTeam?: string | null;
  awayTeam?: string | null;
  league?: string | null;
};

/** True when a team or league name marks Simulated Reality League (SRL) / virtual football. */
export function isVirtualGame(fixture: NamedFixture): boolean {
  return VIRTUAL_GAME.test(`${fixture.homeTeam ?? ''} ${fixture.awayTeam ?? ''} ${fixture.league ?? ''}`);
}

export function omitVirtualGames<T extends NamedFixture>(fixtures: T[]): T[] {
  return fixtures.filter(fixture => !isVirtualGame(fixture));
}

/** Fixed product options matched to real provider selections; no catalog/LLM discovery. */
import type { BookmakerFixture, BookmakerMarket, BookmakerOutcome } from './types';
import { registryForMode } from './market-registry';
import { SPORTYBET_MARKET_IDS } from './enums';

export const SYSTEM_LISTING_MARKET_IDS = [
  SPORTYBET_MARKET_IDS.DOUBLE_CHANCE,
  SPORTYBET_MARKET_IDS.OVER_UNDER,
  SPORTYBET_MARKET_IDS.HOME_GOALS,
  SPORTYBET_MARKET_IDS.AWAY_GOALS,
  SPORTYBET_MARKET_IDS.EXCLUDED_GOALS,
  SPORTYBET_MARKET_IDS.EXCLUDED_GOALS_HOME,
  SPORTYBET_MARKET_IDS.EXCLUDED_GOALS_AWAY,
  SPORTYBET_MARKET_IDS.CARDS,
  SPORTYBET_MARKET_IDS.CARDS_HOME,
  SPORTYBET_MARKET_IDS.CARDS_AWAY,
  SPORTYBET_MARKET_IDS.CORNERS,
  SPORTYBET_MARKET_IDS.CORNERS_HOME,
  SPORTYBET_MARKET_IDS.CORNERS_AWAY,
  SPORTYBET_MARKET_IDS.CORNERS_HOME_ALT,
  SPORTYBET_MARKET_IDS.CORNERS_AWAY_ALT,
  SPORTYBET_MARKET_IDS.TACKLES,
  SPORTYBET_MARKET_IDS.TACKLES_HOME,
  SPORTYBET_MARKET_IDS.TACKLES_AWAY,
  SPORTYBET_MARKET_IDS.GOAL_KICKS,
  SPORTYBET_MARKET_IDS.GOAL_KICKS_HOME,
  SPORTYBET_MARKET_IDS.GOAL_KICKS_AWAY,
];
const definitions = registryForMode('INVESTOR').map(item => ({ ...item,
  market: item.marketPattern ? new RegExp(item.marketPattern, 'i') : null,
  outcome: new RegExp(item.outcomePattern.replace('(?:\\s|$)', '(?:\\s|[0-9]|$)'), 'i'),
}));
export function isSystemMode(mode?: string | null) { return mode === 'INVESTOR' || mode === 'GAMBLER'; }
export function systemSelectionAllowed(market: BookmakerMarket, outcome: BookmakerOutcome) {
  if (!['', '0', 'active', 'open'].includes((market.status ?? '').toLowerCase()) || !outcome.isActive) return false;
  if (!Number.isFinite(outcome.odds) || outcome.odds < 1.1 || outcome.odds > 1.35) return false;
  if (/half|minute|period|player|handicap|winner|1x2|\bor\b|&|\band\b/i.test(market.marketName)) return false;
  return definitions.some(item => {
    const ids = item.providerMarketIds ?? (item.providerMarketId ? [item.providerMarketId] : []);
    return (ids.includes(market.marketId) || Boolean(item.market?.test(market.marketName)))
      && item.outcome.test(outcome.outcomeName.trim());
  });
}
export function systemFixture(fixture: BookmakerFixture): BookmakerFixture {
  return { ...fixture, markets: fixture.markets.map(market => ({ ...market,
    outcomes: market.outcomes.filter(outcome => systemSelectionAllowed(market, outcome)),
  })).filter(market => market.outcomes.length > 0) };
}

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

/** Statsman listing — goals, BTTS, corners, shots, plus common combo / to-score IDs when present. */
export const STATSMAN_LISTING_MARKET_IDS = [
  SPORTYBET_MARKET_IDS.OVER_UNDER,
  SPORTYBET_MARKET_IDS.HOME_GOALS,
  SPORTYBET_MARKET_IDS.AWAY_GOALS,
  SPORTYBET_MARKET_IDS.BTTS,
  SPORTYBET_MARKET_IDS.CORNERS,
  SPORTYBET_MARKET_IDS.CORNERS_HOME,
  SPORTYBET_MARKET_IDS.CORNERS_AWAY,
  SPORTYBET_MARKET_IDS.CORNERS_HOME_ALT,
  SPORTYBET_MARKET_IDS.CORNERS_AWAY_ALT,
  '200', // Total shots
  '201', // Total shots on target
  '50', // Home win either half (common SportyBet id)
  '52', // Away win either half
];

const investorDefinitions = registryForMode('INVESTOR').map(item => ({
  ...item,
  market: item.marketPattern ? new RegExp(item.marketPattern, 'i') : null,
  outcome: new RegExp(item.outcomePattern.replace('(?:\\s|$)', '(?:\\s|[0-9]|$)'), 'i'),
}));

const statsmanDefinitions = registryForMode('STATSMAN').map(item => ({
  ...item,
  market: item.marketPattern ? new RegExp(item.marketPattern, 'i') : null,
  outcome: new RegExp(item.outcomePattern.replace('(?:\\s|$)', '(?:\\s|[0-9]|$)'), 'i'),
}));

/** Over 1.5 Machine — only match totals on the listing page. */
export const OVER15_LISTING_MARKET_IDS = [
  SPORTYBET_MARKET_IDS.OVER_UNDER,
];

export function isSystemMode(mode?: string | null) {
  return mode === 'OVER15_MACHINE' || mode === 'INVESTOR' || mode === 'GAMBLER' || mode === 'STATSMAN';
}

export function listingMarketIdsForMode(mode?: string | null) {
  if (mode === 'STATSMAN') return STATSMAN_LISTING_MARKET_IDS;
  if (mode === 'OVER15_MACHINE') return OVER15_LISTING_MARKET_IDS;
  return SYSTEM_LISTING_MARKET_IDS;
}

function withinLegBand(odds: number) {
  return Number.isFinite(odds) && odds >= 1.1 && odds <= 1.35;
}

function withinOver15LegBand(odds: number) {
  return Number.isFinite(odds) && odds >= 1.1 && odds <= 1.25;
}

function over15SelectionAllowed(market: BookmakerMarket, outcome: BookmakerOutcome) {
  const name = `${market.marketName} ${outcome.outcomeName}`.toLowerCase();
  if (/half|corner|shot|card|kick|tackle|home|away|competitor|1x2|player|handicap/i.test(name)) return false;
  if (!/^over/i.test(outcome.outcomeName.trim())) return false;
  const line = /total=([\d.]+)/.exec(market.specifier ?? '')?.[1]
    ?? /(\d+(?:\.\d+)?)/.exec(outcome.outcomeName)?.[1];
  if (!line) return false;
  const value = Number(line);
  // Keep O1.5 even when priced under 1.11 so the AI can switch that event to O2.5.
  if (value === 1.5) return Number.isFinite(outcome.odds) && outcome.odds >= 1.01 && outcome.odds <= 1.25;
  if (value === 2.5) return withinOver15LegBand(outcome.odds);
  return false;
}

export function systemSelectionAllowed(market: BookmakerMarket, outcome: BookmakerOutcome, mode?: string | null) {
  if (!['', '0', 'active', 'open'].includes((market.status ?? '').toLowerCase()) || !outcome.isActive) return false;
  if (mode === 'OVER15_MACHINE') return over15SelectionAllowed(market, outcome);
  if (!withinLegBand(outcome.odds)) return false;
  if (mode === 'STATSMAN') return statsmanSelectionAllowed(market, outcome);
  if (/half|minute|period|player|handicap|winner|1x2|\bor\b|&|\band\b/i.test(market.marketName)) return false;
  return investorDefinitions.some(item => {
    const ids = item.providerMarketIds ?? (item.providerMarketId ? [item.providerMarketId] : []);
    return (ids.includes(market.marketId) || Boolean(item.market?.test(market.marketName)))
      && item.outcome.test(outcome.outcomeName.trim());
  });
}

function statsmanSelectionAllowed(market: BookmakerMarket, outcome: BookmakerOutcome) {
  const name = `${market.marketName} ${outcome.outcomeName}`.toLowerCase();
  if (/player|handicap|excluded|exact number|winner|1x2/i.test(name) && !/either half|or over|to score/i.test(name)) {
    return false;
  }
  // Team to score / either half / 1-or-over 2.5
  if (/to score|scores?\b/i.test(name) && !/both|btts/i.test(name)) return true;
  if (/either half|win (?:a |one )?half/i.test(name)) return true;
  if (/\bor\b/i.test(name) && /over/i.test(name) && /2\.5/.test(name)) return true;
  return statsmanDefinitions.some(item => {
    const ids = item.providerMarketIds ?? (item.providerMarketId ? [item.providerMarketId] : []);
    return (ids.includes(market.marketId) || Boolean(item.market?.test(market.marketName)))
      && item.outcome.test(outcome.outcomeName.trim());
  });
}

export function systemFixture(fixture: BookmakerFixture, mode?: string | null): BookmakerFixture {
  return {
    ...fixture,
    markets: fixture.markets.map(market => ({
      ...market,
      outcomes: market.outcomes.filter(outcome => systemSelectionAllowed(market, outcome, mode)),
    })).filter(market => market.outcomes.length > 0),
  };
}

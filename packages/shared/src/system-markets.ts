/** Fixed product options matched to real provider selections; no catalog/LLM discovery. */
import type { BookmakerFixture, BookmakerMarket, BookmakerOutcome } from './types';
import { registryForMode, statsmanEngineRegistry } from './market-registry';
import { SPORTYBET_MARKET_IDS } from './enums';
import { withinModeSelectionOdds } from './mode-policy';

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
];

/** Investor / Gambler listing — exclusive list plus Statsman engine extras. */
export const INVESTOR_LISTING_MARKET_IDS = [
  ...SYSTEM_LISTING_MARKET_IDS,
  SPORTYBET_MARKET_IDS.BTTS,
  '200', // Total shots
  '201', // Total shots on target
  '50',  // Home win either half
  '52',  // Away win either half
  '81',  // Home or Over 2.5 (common SportyBet id)
  '82',  // Away or Over 2.5
];

const investorDefinitions = registryForMode('INVESTOR').map(item => ({
  ...item,
  market: item.marketPattern ? new RegExp(item.marketPattern, 'i') : null,
  outcome: new RegExp(item.outcomePattern.replace('(?:\\s|$)', '(?:\\s|[0-9]|$)'), 'i'),
}));

const statsmanDefinitions = statsmanEngineRegistry().map(item => ({
  ...item,
  market: item.marketPattern ? new RegExp(item.marketPattern, 'i') : null,
  outcome: new RegExp(item.outcomePattern.replace('(?:\\s|$)', '(?:\\s|[0-9]|$)'), 'i'),
}));

/** Over 1.5 Machine — only match totals on the listing page. */
export const OVER15_LISTING_MARKET_IDS = [
  SPORTYBET_MARKET_IDS.OVER_UNDER,
];

/** Goals Desk v2 — match totals (incl. Asian Over 2 / total=2). */
export const GOALS_DESK_LISTING_MARKET_IDS = [
  SPORTYBET_MARKET_IDS.OVER_UNDER,
];

/** GGSP v1.1 — Over 1.5 + Asian Over 2 (cheap O1.5 switch). */
export const GGSP_LISTING_MARKET_IDS = [
  SPORTYBET_MARKET_IDS.OVER_UNDER,
];

export function isSystemMode(mode?: string | null) {
  return mode === 'OVER15_MACHINE' || mode === 'GOALS_DESK_V2' || mode === 'GGSP_V11' || mode === 'INVESTOR' || mode === 'GAMBLER';
}

export function listingMarketIdsForMode(mode?: string | null) {
  if (mode === 'OVER15_MACHINE') return OVER15_LISTING_MARKET_IDS;
  if (mode === 'GOALS_DESK_V2') return GOALS_DESK_LISTING_MARKET_IDS;
  if (mode === 'GGSP_V11') return GGSP_LISTING_MARKET_IDS;
  if (mode === 'INVESTOR' || mode === 'GAMBLER') return INVESTOR_LISTING_MARKET_IDS;
  return SYSTEM_LISTING_MARKET_IDS;
}

function withinInvestorLegBand(odds: number, market: BookmakerMarket, outcome: BookmakerOutcome) {
  return withinModeSelectionOdds(odds, 'INVESTOR', market.marketName, outcome.outcomeName);
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

function goalsDeskSelectionAllowed(market: BookmakerMarket, outcome: BookmakerOutcome) {
  const name = `${market.marketName} ${outcome.outcomeName}`.toLowerCase();
  if (/half|corner|shot|card|kick|tackle|home|away|competitor|1x2|player|handicap/i.test(name)) return false;
  if (!/^over/i.test(outcome.outcomeName.trim())) return false;
  const line = /total=([\d.]+)/.exec(market.specifier ?? '')?.[1]
    ?? /(\d+(?:\.\d+)?)/.exec(outcome.outcomeName)?.[1];
  if (!line) return false;
  const value = Number(line);
  const odds = outcome.odds;
  if (!Number.isFinite(odds)) return false;
  // Keep O1.5 at 1.09–1.13 so the AI can switch that event to Asian Over 2 (O1.5 ticket lane).
  if (value === 1.5) return odds >= 1.09 && odds <= 1.27;
  if (value === 2) return odds >= 1.10;
  if (value === 2.5) return odds >= 1.10 && odds <= 1.60;
  return false;
}

function ggspSelectionAllowed(market: BookmakerMarket, outcome: BookmakerOutcome) {
  const name = `${market.marketName} ${outcome.outcomeName}`.toLowerCase();
  if (/half|corner|shot|card|kick|tackle|home|away|competitor|1x2|player|handicap/i.test(name)) return false;
  if (!/^over/i.test(outcome.outcomeName.trim())) return false;
  const line = /total=([\d.]+)/.exec(market.specifier ?? '')?.[1]
    ?? /(\d+(?:\.\d+)?)/.exec(outcome.outcomeName)?.[1];
  if (!line) return false;
  const value = Number(line);
  const odds = outcome.odds;
  if (!Number.isFinite(odds)) return false;
  // Keep O1.5 at 1.09–1.12 so the AI can switch that event to Asian Over 2.
  if (value === 1.5) return odds >= 1.09 && odds <= 1.30;
  if (value === 2) return odds >= 1.10 && odds <= 1.30;
  return false;
}

export function systemSelectionAllowed(market: BookmakerMarket, outcome: BookmakerOutcome, mode?: string | null) {
  if (!['', '0', 'active', 'open'].includes((market.status ?? '').toLowerCase()) || !outcome.isActive) return false;
  const banned = `${market.marketName} ${outcome.outcomeName}`.toLowerCase();
  if (/\btackles?\b|goal[ -]?kicks?/i.test(banned) || ['900614', '900615', '900616', '900622', '900623', '900624'].includes(market.marketId)) {
    return false;
  }
  if (mode === 'OVER15_MACHINE') return over15SelectionAllowed(market, outcome);
  if (mode === 'GOALS_DESK_V2') return goalsDeskSelectionAllowed(market, outcome);
  if (mode === 'GGSP_V11') return ggspSelectionAllowed(market, outcome);
  if (!withinInvestorLegBand(outcome.odds, market, outcome)) return false;
  // Investor / Gambler: exclusive list OR Statsman engine ticket markets.
  if (mode === 'INVESTOR' || mode === 'GAMBLER') {
    if (/half|minute|period|player|handicap|winner|1x2/i.test(market.marketName) && !/either half|or over|to score|2\s*up/i.test(market.marketName)) {
      return false;
    }
    // Never ticket Under goals, corners, or cards. Shots Unders stay allowed.
    const underBanned = /^under/i.test(outcome.outcomeName.trim()) && (
      /corner|card|booking/i.test(market.marketName)
      || /^(?:139|166|167|168|900300|900301|900304|900305)$/.test(market.marketId)
      || (
        !/shot|kick|tackle/i.test(market.marketName)
        && (/^(?:18|19|20)$/.test(market.marketId) || /over\/under|total(?:\s+goals)?|goals?/i.test(market.marketName))
      )
    );
    if (underBanned) return false;
    if (statsmanSelectionAllowed(market, outcome)) return true;
    return investorDefinitions.some(item => {
      const ids = item.providerMarketIds ?? (item.providerMarketId ? [item.providerMarketId] : []);
      return (ids.includes(market.marketId) || Boolean(item.market?.test(market.marketName)))
        && item.outcome.test(outcome.outcomeName.trim());
    });
  }
  if (/half|minute|period|player|handicap|winner|1x2|\bor\b|&|\band\b/i.test(market.marketName)) return false;
  return investorDefinitions.some(item => {
    const ids = item.providerMarketIds ?? (item.providerMarketId ? [item.providerMarketId] : []);
    return (ids.includes(market.marketId) || Boolean(item.market?.test(market.marketName)))
      && item.outcome.test(outcome.outcomeName.trim());
  });
}

function statsmanSelectionAllowed(market: BookmakerMarket, outcome: BookmakerOutcome) {
  const name = `${market.marketName} ${outcome.outcomeName}`.toLowerCase();
  if (/player|handicap|exact score|correct score|winner|1x2/i.test(name) && !/either half|or over|to score|excluded|exact (?:number of )?goals|2\s*up/i.test(name)) {
    return false;
  }
  // Team to score / either half / 1-or-over 2.5 / excluded goals / 2UP
  if (/clean\s*sheet/i.test(name)) return true;
  if (/either half|win (?:a |one )?half/i.test(name)) return true;
  // Sporty 2UP home/away (not draw) — Statsman gates favourite ≥80%.
  if (/\b2\s*up\b/i.test(name) && !/^(?:draw|x)$/i.test(outcome.outcomeName.trim())) return true;
  // Sporty is often "{club} or Over 2.5" — do not require home/away labels. Still ban draw/under.
  if (/\bor\b/i.test(name) && /over/i.test(name) && /2\.5/.test(name) && !/\bdraw\b|\bunder\b/i.test(name) && !/^(?:no|ng)$/i.test(outcome.outcomeName.trim())) return true;
  if (/excluded|exact number of goals|\bexact goals\b/i.test(name)) return true;
  // Team Over 0.5 — Sporty stand-in for team to score
  if (/total=0\.5/.test(market.specifier ?? '') && /^over/i.test(outcome.outcomeName.trim())
    && /home|away|competitor/i.test(market.marketName) && /goal|over\/under|total/i.test(market.marketName)
    && !/corner|shot|card|kick|tackle/i.test(market.marketName)) return true;
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

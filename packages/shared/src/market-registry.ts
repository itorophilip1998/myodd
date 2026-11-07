import type { BookmakerFixture } from './types';
import type { GenerationConfig } from './schemas';

export const MARKET_REGISTRY_VERSION = 5;
type Definition = { id: string; category: string; label: string; providerMarketId?: string; providerMarketIds?: string[]; marketPattern?: string; outcomePattern: string; line?: string; gamblerOnly?: boolean };
export const MARKET_REGISTRY: Definition[] = [
  { id: 'result.home', category: 'Match Result', label: 'Home Win (1)', providerMarketId: '1', outcomePattern: '^(1|home|home win)$' },
  { id: 'result.draw', category: 'Match Result', label: 'Draw (X)', providerMarketId: '1', outcomePattern: '^(x|draw)$' },
  { id: 'result.away', category: 'Match Result', label: 'Away Win (2)', providerMarketId: '1', outcomePattern: '^(2|away|away win)$' },
  { id: 'result.any', category: 'Match Result', label: '1X2', providerMarketId: '1', outcomePattern: '.' },
  // Sporty 2UP early-payout win — Investor/Gambler Statsman gate favourite ≥80%.
  { id: 'result.2up.home', category: '2UP', label: '2UP Home', gamblerOnly: true, providerMarketId: '1', marketPattern: '^(?=.*\\b2\\s*up\\b)', outcomePattern: '^(1|home|home win)$' },
  { id: 'result.2up.away', category: '2UP', label: '2UP Away', gamblerOnly: true, providerMarketId: '1', marketPattern: '^(?=.*\\b2\\s*up\\b)', outcomePattern: '^(2|away|away win)$' },
  ...['1X', 'X2', '12'].map(value => ({ id: `chance.${value.toLowerCase()}`, category: 'Double Chance', label: value, providerMarketId: '10', outcomePattern: `^${value}$` })),
  ...['over', 'under'].flatMap(direction => ['0.5', '1.5', '2.5', '3.5'].map(line => ({ id: `goals.${direction}.${line}`, category: 'Total Goals', label: `${direction === 'over' ? 'Over' : 'Under'} ${line}`, providerMarketId: '18', outcomePattern: `^${direction}(?:\\s|$)`, line }))),
  { id: 'btts.yes', category: 'Both Teams to Score', label: 'GG / Yes', providerMarketId: '29', outcomePattern: '^(yes|gg)$' },
  { id: 'btts.no', category: 'Both Teams to Score', label: 'NG / No', providerMarketId: '29', outcomePattern: '^(no|ng)$' },
  { id: 'half.result', category: 'Half-Time / Full-Time', label: 'Half-time result', marketPattern: '^(1st half|first half|half[ -]?time) (1x2|result)$', outcomePattern: '.' },
  { id: 'half.draw', category: 'Draw Markets', label: 'Half-time draw', marketPattern: '^(1st half|first half|half[ -]?time) (1x2|result)$', outcomePattern: '^(draw|x)$' },
  { id: 'htft.any', category: 'Half-Time / Full-Time', label: 'HT/FT combinations', marketPattern: '^(ht/ft|half[ -]?time/full[ -]?time|halftime/fulltime)$', outcomePattern: '.' },
  { id: 'excluded.goals', category: 'Excluded Goals', label: 'Excluded Goals', gamblerOnly: true, providerMarketId: '450004', marketPattern: '^(?=.*(?:excluded(?: number of)? goals|exact number of goals|exact goals))(?!.*\\b(?:home|away|team|competitor)\\b)', outcomePattern: '.' },
  { id: 'excluded.goals.home', category: 'Excluded Goals', label: 'Excluded Goals – Home', gamblerOnly: true, providerMarketId: '450005', marketPattern: '^(?=.*(?:exact|excluded))(?=.*goal)(?=.*\\b(?:home|competitor1)\\b)(?!.*\\baway\\b)', outcomePattern: '.' },
  { id: 'excluded.goals.away', category: 'Excluded Goals', label: 'Excluded Goals – Away', gamblerOnly: true, providerMarketId: '450006', marketPattern: '^(?=.*(?:exact|excluded))(?=.*goal)(?=.*\\b(?:away|competitor2)\\b)', outcomePattern: '.' },
  // Investor / Gambler cards: Overs only (no Under cards).
  { id: 'cards.total', category: 'Cards', label: 'Total Cards', gamblerOnly: true, providerMarketId: '139', marketPattern: '^(?=.*\\b(?:cards?|bookings?)\\b)(?!.*\\b(?:home|away|team|competitor)\\b)', outcomePattern: '^over(?:\\s|$)' },
  { id: 'cards.home', category: 'Cards', label: 'Home Team Cards', gamblerOnly: true, providerMarketId: '900304', marketPattern: '^(?=.*\\b(?:cards?|bookings?)\\b)(?=.*\\b(?:home|competitor1)\\b)(?!.*\\baway\\b)', outcomePattern: '^over(?:\\s|$)' },
  { id: 'cards.away', category: 'Cards', label: 'Away Team Cards', gamblerOnly: true, providerMarketId: '900305', marketPattern: '^(?=.*\\b(?:cards?|bookings?)\\b)(?=.*\\b(?:away|competitor2)\\b)', outcomePattern: '^over(?:\\s|$)' },
  // Investor / Gambler corners: Overs only (no Under corners).
  { id: 'corners.total', category: 'Corners', label: 'Total Corners', gamblerOnly: true, providerMarketId: '166', marketPattern: '^(?=.*\\bcorners?\\b)(?!.*\\b(?:home|away|team|competitor|1x2|winner|handicap)\\b)', outcomePattern: '^over(?:\\s|$)' },
  { id: 'corners.home', category: 'Corners', label: 'Home Team Corners', gamblerOnly: true, providerMarketId: '167', providerMarketIds: ['167', '900300'], marketPattern: '^(?=.*\\bcorners?\\b)(?=.*\\b(?:home|competitor1)\\b)(?!.*\\baway\\b)', outcomePattern: '^over(?:\\s|$)' },
  { id: 'corners.away', category: 'Corners', label: 'Away Team Corners', gamblerOnly: true, providerMarketId: '168', providerMarketIds: ['168', '900301'], marketPattern: '^(?=.*\\bcorners?\\b)(?=.*\\b(?:away|competitor2)\\b)(?!.*\\bhome\\b)', outcomePattern: '^over(?:\\s|$)' },
  // Investor / Gambler goals: Overs only (no Under goals).
  { id: 'goals.match', category: 'Goals', label: 'Total Goals', gamblerOnly: true, providerMarketId: '18', marketPattern: '^(?:over/under|total(?:\\s+goals)?)$', outcomePattern: '^over(?:\\s|$)' },
  { id: 'goals.home', category: 'Goals', label: 'Home Team Goals', gamblerOnly: true, providerMarketId: '19', marketPattern: '^(?=.*\\b(?:home|competitor1)\\b)(?=.*(?:over/under|total|goals?))(?!.*\\b(?:corner|card|booking|shot|kick|tackle|half|handicap|exact|excluded|away|clean)\\b)', outcomePattern: '^over(?:\\s|$)' },
  { id: 'goals.away', category: 'Goals', label: 'Away Team Goals', gamblerOnly: true, providerMarketId: '20', marketPattern: '^(?=.*\\b(?:away|competitor2)\\b)(?=.*(?:over/under|total|goals?))(?!.*\\b(?:corner|card|booking|shot|kick|tackle|half|handicap|exact|excluded|clean)\\b)', outcomePattern: '^over(?:\\s|$)' },
  { id: 'clean.sheet.home', category: 'Clean sheet', label: 'Home Clean Sheet', gamblerOnly: true, marketPattern: '^(?=.*clean\\s*sheet)(?=.*\\b(?:home|competitor1)\\b)(?!.*\\baway\\b)', outcomePattern: '^(yes|no|gg|ng)$' },
  { id: 'clean.sheet.away', category: 'Clean sheet', label: 'Away Clean Sheet', gamblerOnly: true, marketPattern: '^(?=.*clean\\s*sheet)(?=.*\\b(?:away|competitor2)\\b)(?!.*\\bhome\\b)', outcomePattern: '^(yes|no|gg|ng)$' },
  { id: 'home.or.over.2.5', category: 'Home or Over', label: 'Home or Over 2.5', gamblerOnly: true, marketPattern: '^(?=.*\\b(?:home|competitor1)\\b)(?=.*\\bor\\b)(?=.*\\bover\\b)(?=.*2\\.5)(?!.*\\b(?:away|under|draw|half)\\b)', outcomePattern: '^(?!no$|ng$).+' },
  { id: 'away.or.over.2.5', category: 'Away or Over', label: 'Away or Over 2.5', gamblerOnly: true, marketPattern: '^(?=.*\\b(?:away|competitor2)\\b)(?=.*\\bor\\b)(?=.*\\bover\\b)(?=.*2\\.5)(?!.*\\b(?:home|under|draw|half)\\b)', outcomePattern: '^(?!no$|ng$).+' },
  { id: 'draw.or.over.2.5', category: 'Draw or Over', label: 'Draw or Over 2.5', gamblerOnly: true, marketPattern: '^(?=.*\\bdraw\\b)(?=.*\\bor\\b)(?=.*\\bover\\b)(?=.*2\\.5)(?!.*\\b(?:home|away|under|half)\\b)', outcomePattern: '^(?!no$|ng$).+' },
  { id: 'shots.total', category: 'Shots', label: 'Shots', gamblerOnly: true, marketPattern: '^(?=.*\\bshots?\\b)(?!.*on target)(?!.*\\b(?:home|away|team|competitor|player)\\b)', outcomePattern: '^(over|under)(?:\\s|$)' },
  { id: 'shots.target', category: 'Shots', label: 'Shots on target', gamblerOnly: true, marketPattern: '^(?=.*\\bshots?\\b)(?=.*on target)(?!.*\\b(?:home|away|team|competitor|player)\\b)', outcomePattern: '^(over|under)(?:\\s|$)' },
  { id: 'shots.team', category: 'Shots', label: 'Team shots', gamblerOnly: true, marketPattern: '^(?=.*\\bshots?\\b)(?!.*on target)(?=.*\\b(?:home|away|team|competitor)\\b)(?!.*\\bplayer\\b)', outcomePattern: '^(over|under)(?:\\s|$)' },
  { id: 'shots.team.target', category: 'Shots', label: 'Team shots on target', gamblerOnly: true, marketPattern: '^(?=.*\\bshots?\\b)(?=.*on target)(?=.*\\b(?:home|away|team|competitor)\\b)(?!.*\\bplayer\\b)', outcomePattern: '^(over|under)(?:\\s|$)' },
];

const GAMBLER_DOUBLE_CHANCE = new Set(['chance.1x', 'chance.x2', 'chance.12']);

export function registryForMode(mode?: string | null) {
  if (mode === 'OVER15_MACHINE') {
    return MARKET_REGISTRY.filter(item => item.id === 'goals.over.1.5' || item.id === 'goals.over.2.5');
  }
  if (mode === 'GOALS_DESK_V2') {
    return MARKET_REGISTRY.filter(item => item.id === 'goals.over.1.5' || item.id === 'goals.over.2.5');
  }
  if (mode === 'GGSP_V11') {
    return MARKET_REGISTRY.filter(item => item.id === 'goals.over.1.5');
  }
  // Investor / Gambler: exclusive list + Statsman engine ticket markets (no tackles / goal kicks).
  if (mode === 'INVESTOR' || mode === 'GAMBLER') {
    return MARKET_REGISTRY.filter(item =>
      !/^(?:goalkicks\.|tackles\.)/.test(item.id)
      && (item.gamblerOnly
        || GAMBLER_DOUBLE_CHANCE.has(item.id)
        || /^(?:btts\.|shots\.|home\.or\.over|away\.or\.over|clean\.sheet|result\.2up)/.test(item.id)));
  }
  return MARKET_REGISTRY.filter(item => !item.gamblerOnly && !/^(?:goalkicks\.|tackles\.)/.test(item.id));
}

/** Markets the Statsman engine may ticket (Investor / Gambler gates). */
export function statsmanEngineRegistry() {
  return MARKET_REGISTRY.filter(item =>
    /^(?:goals\.|btts\.|corners\.|shots\.|cards\.|excluded\.|home\.or\.over|away\.or\.over|clean\.sheet|result\.2up)/.test(item.id)
    || GAMBLER_DOUBLE_CHANCE.has(item.id));
}

export function resolveMarketIds(ids: string[], fixtures: BookmakerFixture[]) {
  const rules = new Map<string, GenerationConfig['marketRules'][number]>();
  const unavailable: string[] = [];
  for (const id of ids) {
    const definition = MARKET_REGISTRY.find(item => item.id === id);
    let found = false;
    if (!definition) { unavailable.push(id); continue; }
    for (const fixture of fixtures) for (const market of fixture.markets) {
      if (!['', '0', 'active', 'open'].includes(market.status.toLowerCase())) continue;
      const ids = definition.providerMarketIds ?? (definition.providerMarketId ? [definition.providerMarketId] : []);
      const idMatch = ids.includes(market.marketId);
      const nameMatch = definition.marketPattern ? new RegExp(definition.marketPattern, 'i').test(market.marketName) : false;
      if (!idMatch && !nameMatch) continue;
      if (definition.line && !new RegExp(`(?:^|[|;,])total=${definition.line.replace('.', '\\.')}($|[|;,])`).test(market.specifier ?? '')) continue;
      const outcomes = market.outcomes.filter(outcome => outcome.isActive && new RegExp(definition.outcomePattern, 'i').test(outcome.outcomeName.trim()));
      if (!outcomes.length) continue;
      found = true;
      const key = `${market.marketId}|${market.specifier ?? ''}`;
      const rule = rules.get(key) ?? { marketId: market.marketId, specifier: market.specifier ?? '', outcomeIds: [] };
      rule.outcomeIds = [...new Set([...rule.outcomeIds, ...outcomes.map(outcome => outcome.outcomeId)])];
      rules.set(key, rule);
    }
    if (!found) unavailable.push(definition.label);
  }
  return { rules: [...rules.values()], unavailable };
}

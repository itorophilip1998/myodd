import type { BookmakerFixture } from './types';
import type { GenerationConfig } from './schemas';

export const MARKET_REGISTRY_VERSION = 2;
type Definition = { id: string; category: string; label: string; providerMarketId?: string; marketPattern?: string; outcomePattern: string; line?: string; gamblerOnly?: boolean };
export const MARKET_REGISTRY: Definition[] = [
  { id: 'result.home', category: 'Match Result', label: 'Home Win (1)', providerMarketId: '1', outcomePattern: '^(1|home|home win)$' },
  { id: 'result.draw', category: 'Match Result', label: 'Draw (X)', providerMarketId: '1', outcomePattern: '^(x|draw)$' },
  { id: 'result.away', category: 'Match Result', label: 'Away Win (2)', providerMarketId: '1', outcomePattern: '^(2|away|away win)$' },
  { id: 'result.any', category: 'Match Result', label: '1X2', providerMarketId: '1', outcomePattern: '.' },
  ...['1X', 'X2', '12'].map(value => ({ id: `chance.${value.toLowerCase()}`, category: 'Double Chance', label: value, providerMarketId: '10', outcomePattern: `^${value}$` })),
  ...['over', 'under'].flatMap(direction => ['0.5', '1.5', '2.5', '3.5'].map(line => ({ id: `goals.${direction}.${line}`, category: 'Total Goals', label: `${direction === 'over' ? 'Over' : 'Under'} ${line}`, providerMarketId: '18', outcomePattern: `^${direction}(?:\\s|$)`, line }))),
  { id: 'btts.yes', category: 'Both Teams to Score', label: 'GG / Yes', providerMarketId: '29', outcomePattern: '^(yes|gg)$' },
  { id: 'btts.no', category: 'Both Teams to Score', label: 'NG / No', providerMarketId: '29', outcomePattern: '^(no|ng)$' },
  { id: 'half.result', category: 'Half-Time / Full-Time', label: 'Half-time result', marketPattern: '^(1st half|first half|half[ -]?time) (1x2|result)$', outcomePattern: '.' },
  { id: 'half.draw', category: 'Draw Markets', label: 'Half-time draw', marketPattern: '^(1st half|first half|half[ -]?time) (1x2|result)$', outcomePattern: '^(draw|x)$' },
  { id: 'htft.any', category: 'Half-Time / Full-Time', label: 'HT/FT combinations', marketPattern: '^(ht/ft|half[ -]?time/full[ -]?time|halftime/fulltime)$', outcomePattern: '.' },
  { id: 'half.either', category: 'Half-Time / Full-Time', label: 'Win either half', gamblerOnly: true, marketPattern: '\\bwin either half\\b', outcomePattern: '.' },
  { id: 'player.score.yes', category: 'Player to score', label: 'Player to score: Yes', gamblerOnly: true, marketPattern: '^(?!.*\\b(?:both teams|team|first|last|next|either|anytime|home|away)\\b).*\\bto score\\b', outcomePattern: '^yes$' },
  { id: 'player.score.no', category: 'Player to score', label: 'Player to score: No', gamblerOnly: true, marketPattern: '^(?!.*\\b(?:both teams|team|first|last|next|either|anytime|home|away)\\b).*\\bto score\\b', outcomePattern: '^no$' },
  { id: 'lead.three.yes', category: 'Goals', label: 'Leading by 3 goals in a row: Yes', gamblerOnly: true, marketPattern: '^(?=.*\\b3\\b)(?=.*goal)(?=.*(?:lead|row|consecutive))', outcomePattern: '^yes$' },
  { id: 'lead.three.no', category: 'Goals', label: 'Leading by 3 goals in a row: No', gamblerOnly: true, marketPattern: '^(?=.*\\b3\\b)(?=.*goal)(?=.*(?:lead|row|consecutive))', outcomePattern: '^no$' },
  { id: 'corners.total', category: 'Corners', label: 'Corner totals', gamblerOnly: true, marketPattern: '^(?=.*corner)(?=.*(?:total|over/under|\\bover\\b|\\bunder\\b))(?!.*\\b(?:home|away|team|competitor|1x2|winner|handicap|card|booking)\\b)', outcomePattern: '.' },
  { id: 'corners.team', category: 'Corners', label: 'Team corners', gamblerOnly: true, marketPattern: '^(?=.*corner)(?=.*(?:total|over/under|\\bover\\b|\\bunder\\b))(?=.*\\b(?:home|away|team|competitor)\\b)(?!.*\\b(?:1x2|winner|handicap|card|booking)\\b)', outcomePattern: '.' },
  { id: 'shots.total', category: 'Shots', label: 'Shot totals', gamblerOnly: true, marketPattern: '^(?=.*\\bshots?\\b)(?=.*(?:total|over/under|\\bover\\b|\\bunder\\b))(?!.*on target)(?!.*\\bplayer\\b)(?!.*\\b(?:1x2|winner|handicap)\\b)', outcomePattern: '.' },
  { id: 'shots.target', category: 'Shots', label: 'Shots on target', gamblerOnly: true, marketPattern: '^(?=.*\\bshots?\\b)(?=.*on target)(?=.*(?:total|over/under|\\bover\\b|\\bunder\\b))(?!.*\\bplayer\\b)(?!.*\\b(?:1x2|winner|handicap)\\b)', outcomePattern: '.' },
  { id: 'goals.excluded', category: 'Goals', label: 'Excluded number of goals', gamblerOnly: true, marketPattern: 'excluded number of goals|exact number of goals|\\bexact goals\\b', outcomePattern: '.' },
  { id: 'goalkicks.total', category: 'Goal kicks', label: 'Goal kicks', gamblerOnly: true, marketPattern: '^(?=.*goal[ -]?kicks?)(?!.*\\b(?:1x2|winner|handicap|card|booking)\\b)', outcomePattern: '.' },
];

export function registryForMode(mode?: string | null) {
  return MARKET_REGISTRY.filter(item => !item.gamblerOnly || mode === 'GAMBLER');
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
      if (definition.providerMarketId ? market.marketId !== definition.providerMarketId : !new RegExp(definition.marketPattern!, 'i').test(market.marketName)) continue;
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

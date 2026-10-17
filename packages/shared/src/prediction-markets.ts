export const PREDICTION_MARKETS = [
  { value: 'all', label: 'None · all markets' },
  { value: 'result', label: 'Match result' },
  { value: 'over', label: 'Over goals' },
  { value: 'under', label: 'Under goals' },
  { value: 'draws', label: 'Draws' },
  { value: 'corners', label: 'Corners' },
  { value: 'btts', label: 'Both teams to score' },
  { value: 'chance', label: 'Double chance' },
  { value: 'handicap', label: 'Handicaps' },
  { value: 'cards', label: 'Cards' },
  { value: 'score', label: 'Correct score' },
] as const;
export type PredictionMarket = typeof PREDICTION_MARKETS[number]['value'];

/** Match the bookmaker's actual market and outcome, never replace a requested type. */
export function matchesPredictionMarket(p: { marketId: string; marketName?: string; selectionName?: string }, type: PredictionMarket): boolean {
  const market = (p.marketName ?? '').toLowerCase();
  const outcome = (p.selectionName ?? '').trim().toLowerCase();
  const corners = /\bcorners?\b/.test(market);
  const cards = /\bcards?\b|\bbookings?\b/.test(market);
  switch (type) {
    case 'all': return true;
    case 'corners': return corners;
    case 'cards': return cards;
    case 'over':
    case 'under': return !corners && !cards && (p.marketId === '18' || /goals?|over\s*\/\s*under|total/.test(market)) && new RegExp(`^${type}\\b`).test(outcome);
    case 'draws': return !corners && !cards && !/double chance|handicap|correct score|&/.test(market) && /^(draw|x)(?:\s|$)/.test(outcome);
    case 'result': return p.marketId === '1' || /^(1x2|match result|full[ -]time result)$/.test(market);
    case 'btts': return p.marketId === '29' || /both teams.*score|gg\s*\/\s*ng|btts/.test(market);
    case 'chance': return p.marketId === '10' || /double chance/.test(market);
    case 'handicap': return /handicap/.test(market) && !corners && !cards;
    case 'score': return /correct score/.test(market) && !corners && !cards;
  }
}

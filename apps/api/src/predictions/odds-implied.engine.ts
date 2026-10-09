import { Injectable } from '@nestjs/common';
import {
  SupportedMarket,
  type BookmakerOutcome,
  type BookmakerSelection,
} from '@myodd/shared';
import type { PredictionEngine, ScoreContext } from './prediction.engine';

const LOWER_VARIANCE_MARKETS = new Set([
  SupportedMarket.DOUBLE_CHANCE_1X,
  SupportedMarket.DOUBLE_CHANCE_X2,
  SupportedMarket.DOUBLE_CHANCE_12,
  SupportedMarket.OVER_1_5,
  SupportedMarket.BTTS_YES,
]);

@Injectable()
export class OddsImpliedEngine implements PredictionEngine {
  readonly modelVersion = 'odds-v1';

  score(selection: BookmakerSelection, context: ScoreContext) {
    const odds = selection.odds ?? 0;
    const fair = fairProbability(odds, context.marketOutcomes);
    const marketBias = marketTypeBias(context.supportedMarket);
    const stability = selection.isActive === false ? -15 : 0;
    const favouriteBoost = fair >= 0.55 ? 8 : fair >= 0.4 ? 3 : -5;

    // Map fair probability (0-1) into roughly 35-95 confidence band
    let confidence =
      35 + fair * 55 + marketBias + favouriteBoost + stability;
    confidence = Math.max(20, Math.min(95, Math.round(confidence)));

    return {
      probability: Math.round(fair * 1000) / 1000,
      confidence,
      modelVersion: this.modelVersion,
    };
  }
}

function fairProbability(
  odds: number,
  marketOutcomes: BookmakerOutcome[],
): number {
  if (!odds || odds <= 1) return 0.01;
  const rawImplied = 1 / odds;
  const active = marketOutcomes.filter((o) => o.isActive && o.odds > 1);
  if (active.length === 0) return Math.min(0.99, rawImplied);

  const overround = active.reduce((sum, o) => sum + 1 / o.odds, 0);
  if (overround <= 0) return Math.min(0.99, rawImplied);
  return Math.min(0.99, Math.max(0.01, rawImplied / overround));
}

function marketTypeBias(market: SupportedMarket): number {
  if (LOWER_VARIANCE_MARKETS.has(market)) return 6;
  if (market === SupportedMarket.OVER_2_5) return 2;
  if (market === SupportedMarket.UNDER_3_5) return 2;
  if (market === SupportedMarket.HOME || market === SupportedMarket.AWAY) {
    return -2;
  }
  return 0;
}

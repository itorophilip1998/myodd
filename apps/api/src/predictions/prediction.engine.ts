import type { BookmakerOutcome, ScoredSelection, SupportedMarket } from '@myodd/shared';
import type { BookmakerSelection } from '@myodd/shared';

export interface ScoreContext {
  marketOutcomes: BookmakerOutcome[];
  supportedMarket: SupportedMarket;
}

export interface PredictionEngine {
  score(
    selection: BookmakerSelection,
    context: ScoreContext,
  ): Pick<ScoredSelection, 'probability' | 'confidence' | 'modelVersion'>;
}

export const PREDICTION_ENGINE = Symbol('PREDICTION_ENGINE');

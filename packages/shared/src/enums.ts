export enum SupportedMarket {
  OTHER = 'OTHER',
  DRAW = 'DRAW',
  HOME = 'HOME',
  AWAY = 'AWAY',
  DOUBLE_CHANCE_1X = 'DOUBLE_CHANCE_1X',
  DOUBLE_CHANCE_X2 = 'DOUBLE_CHANCE_X2',
  DOUBLE_CHANCE_12 = 'DOUBLE_CHANCE_12',
  OVER_1_5 = 'OVER_1_5',
  OVER_2_5 = 'OVER_2_5',
  UNDER_3_5 = 'UNDER_3_5',
  BTTS_YES = 'BTTS_YES',
  BTTS_NO = 'BTTS_NO',
}

export enum RiskPreference {
  VERY_LOW = 'VERY_LOW',
  VERY_HIGH = 'VERY_HIGH',
  LOWER = 'LOWER',
  MODERATE = 'MODERATE',
  HIGHER = 'HIGHER',
}

export enum VarianceLevel {
  LOWER = 'LOWER',
  MODERATE = 'MODERATE',
  HIGHER = 'HIGHER',
}

export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/** SportyBet market IDs we support in V1. System listing IDs are the provided Investor/Gambler options. */
export const SPORTYBET_MARKET_IDS = {
  MATCH_RESULT: '1',
  DOUBLE_CHANCE: '10',
  OVER_UNDER: '18',
  HOME_GOALS: '19',
  AWAY_GOALS: '20',
  BTTS: '29',
  CARDS: '139',
  CORNERS: '166',
  CORNERS_HOME: '167',
  CORNERS_AWAY: '168',
  CORNERS_HOME_ALT: '900300',
  CORNERS_AWAY_ALT: '900301',
  CARDS_HOME: '900304',
  CARDS_AWAY: '900305',
  EXCLUDED_GOALS: '450004',
  EXCLUDED_GOALS_HOME: '450005',
  EXCLUDED_GOALS_AWAY: '450006',
  TACKLES: '900614',
  TACKLES_HOME: '900615',
  TACKLES_AWAY: '900616',
  GOAL_KICKS: '900622',
  GOAL_KICKS_HOME: '900623',
  GOAL_KICKS_AWAY: '900624',
} as const;

export const SUPPORTED_MARKET_LABELS: Record<SupportedMarket, string> = {
  [SupportedMarket.OTHER]: 'Other bookmaker market',
  [SupportedMarket.DRAW]: 'Draw',
  [SupportedMarket.HOME]: 'Home Win',
  [SupportedMarket.AWAY]: 'Away Win',
  [SupportedMarket.DOUBLE_CHANCE_1X]: '1X',
  [SupportedMarket.DOUBLE_CHANCE_X2]: 'X2',
  [SupportedMarket.DOUBLE_CHANCE_12]: '12',
  [SupportedMarket.OVER_1_5]: 'Over 1.5',
  [SupportedMarket.OVER_2_5]: 'Over 2.5',
  [SupportedMarket.UNDER_3_5]: 'Under 3.5',
  [SupportedMarket.BTTS_YES]: 'BTTS Yes',
  [SupportedMarket.BTTS_NO]: 'BTTS No',
};

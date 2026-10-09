export enum SupportedMarket {
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

/** SportyBet market IDs we support in V1 */
export const SPORTYBET_MARKET_IDS = {
  MATCH_RESULT: '1',
  DOUBLE_CHANCE: '10',
  OVER_UNDER: '18',
  BTTS: '29',
} as const;

export const SUPPORTED_MARKET_LABELS: Record<SupportedMarket, string> = {
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

import { generationConfigSchema, isSystemMode, MODE_ODDS, RiskPreference, type GenerationConfig } from '@myodd/shared';

/** A fixed mode is executable product policy; it does not need a language-model planner. */
export function systemConfig(mode: GenerationConfig['riskMode']): GenerationConfig {
  if (!isSystemMode(mode)) throw new Error('Unsupported fixed generation mode');
  const band = MODE_ODDS[mode!];
  return generationConfigSchema.parse({ riskMode: mode,
    riskPreference: mode === 'INVESTOR' ? RiskPreference.VERY_LOW : RiskPreference.MODERATE,
    minimumOdds: band.minimum, maximumOdds: band.maximum, numberOfSlips: 10,
    minimumSelections: 1, maximumSelections: 50, fixtureMode: 'upcoming',
    markets: [], marketRules: [], relatedMarketRules: [], marketQueries: [], marketPolicy: 'prefer',
    preserveOriginalSelections: false, allowOddsAdjustment: false,
  });
}

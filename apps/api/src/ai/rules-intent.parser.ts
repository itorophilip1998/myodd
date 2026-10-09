import {
  RiskPreference,
  SupportedMarket,
  generationConfigSchema,
  type GenerationConfig,
} from '@myodd/shared';

export function parseInstructionRules(instruction: string): GenerationConfig {
  const text = instruction.toLowerCase();
  const numberOfSlips =
    extractNumber(text, /create\s+(\d+)/) ??
    extractNumber(
      text,
      /(\d+)(?:\s+[\w-]+)*\s+(?:slips?|codes?|combinations?|versions?)/,
    ) ??
    extractNumber(text, /generate\s+(\d+)/) ??
    10;

  const between = text.match(
    /between\s+(\d+(?:\.\d+)?)\s*(?:and|–|-|to)\s*(\d+(?:\.\d+)?)/,
  );
  const around = text.match(/around\s+(\d+(?:\.\d+)?)/);
  let minimumOdds = 2.5;
  let maximumOdds = 5;
  if (between) {
    minimumOdds = Number(between[1]);
    maximumOdds = Number(between[2]);
  } else if (around) {
    const mid = Number(around[1]);
    minimumOdds = Math.max(1.1, mid * 0.8);
    maximumOdds = mid * 1.2;
  }

  const maxSel =
    extractNumber(text, /max(?:imum)?\s+(\d+)\s*selections?/) ??
    extractNumber(text, /(\d+)\s*selections?\s*max/) ??
    8;

  let riskPreference = RiskPreference.MODERATE;
  if (
    /safer|lower[- ]?risk|lower[- ]?variance|conservative|low[- ]?risk/.test(
      text,
    )
  ) {
    riskPreference = RiskPreference.LOWER;
  } else if (
    /aggressive|higher[- ]?risk|higher[- ]?variance|high[- ]?odds|risky/.test(
      text,
    )
  ) {
    riskPreference = RiskPreference.HIGHER;
  }

  const markets: SupportedMarket[] = [];
  if (/double\s*chance|1x|x2|\b12\b/.test(text)) {
    markets.push(
      SupportedMarket.DOUBLE_CHANCE_1X,
      SupportedMarket.DOUBLE_CHANCE_X2,
      SupportedMarket.DOUBLE_CHANCE_12,
    );
  }
  if (/over\s*1\.?5|o1\.5/.test(text)) markets.push(SupportedMarket.OVER_1_5);
  if (/over\s*2\.?5|o2\.5/.test(text)) markets.push(SupportedMarket.OVER_2_5);
  if (/under\s*3\.?5|u3\.5/.test(text)) markets.push(SupportedMarket.UNDER_3_5);
  if (/btts|both\s*teams/.test(text)) {
    markets.push(SupportedMarket.BTTS_YES, SupportedMarket.BTTS_NO);
  }
  if (/straight\s*wins?|home\s*win|favourites?|favorites?/.test(text)) {
    markets.push(SupportedMarket.HOME, SupportedMarket.AWAY);
  }
  if (/don't use straight wins|no straight wins|no moneyline/.test(text)) {
    // keep only non-moneyline defaults below
  }

  const excludedTeams: string[] = [];
  const removeMatch = instruction.match(
    /remove\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i,
  );
  if (removeMatch) {
    excludedTeams.push(removeMatch[1].trim());
  }

  const kickoffBefore = null;

  const defaults = generationConfigSchema.parse({
    numberOfSlips: Math.min(50, Math.max(1, numberOfSlips)),
    minimumOdds,
    maximumOdds: Math.max(minimumOdds + 0.1, maximumOdds),
    maximumSelections: maxSel,
    markets:
      markets.length > 0
        ? markets
        : riskPreference === RiskPreference.LOWER
          ? [
              SupportedMarket.DOUBLE_CHANCE_1X,
              SupportedMarket.DOUBLE_CHANCE_X2,
              SupportedMarket.OVER_1_5,
            ]
          : undefined,
    riskPreference,
    excludedTeams,
    kickoffBefore,
  });

  return defaults;
}

function extractNumber(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  return Number(m[1]);
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  generationConfigSchema,
  type GenerationConfig,
} from '@myodd/shared';
import { LLM_PROVIDER, type LlmProvider } from './llm.provider';
import { parseInstructionRules } from './rules-intent.parser';

const SYSTEM_PROMPT = `You convert betting slip generation instructions into JSON configuration.
Never select teams, matches, markets IDs, or outcomes. Never invent SportyBet IDs.
Only return configuration fields. Use probability/variance language, never "safe" or "guaranteed".
Valid markets: HOME, AWAY, DOUBLE_CHANCE_1X, DOUBLE_CHANCE_X2, DOUBLE_CHANCE_12, OVER_1_5, OVER_2_5, UNDER_3_5, BTTS_YES, BTTS_NO.
Valid riskPreference: LOWER, MODERATE, HIGHER.
Return a single JSON object matching the schema.`;

@Injectable()
export class IntentParserService {
  private readonly logger = new Logger(IntentParserService.name);

  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  async parse(instruction: string): Promise<GenerationConfig> {
    try {
      const raw = await this.llm.completeJson({
        system: SYSTEM_PROMPT,
        user: instruction,
        schema: generationConfigSchema,
      });
      const result = generationConfigSchema.parse(raw);
      if (result.maximumOdds < result.minimumOdds) {
        return {
          ...result,
          maximumOdds: result.minimumOdds,
          minimumOdds: result.maximumOdds,
        };
      }
      return result;
    } catch (err) {
      this.logger.warn(
        `LLM intent parse failed, using rules fallback: ${(err as Error).message}`,
      );
      return parseInstructionRules(instruction);
    }
  }
}

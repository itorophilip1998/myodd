import { Injectable } from '@nestjs/common';
import type { LlmCompleteJsonInput, LlmProvider } from './llm.provider';
import { parseInstructionRules } from './rules-intent.parser';

/** Deterministic stub — uses rules parser; no external API calls. */
@Injectable()
export class StubLlmProvider implements LlmProvider {
  async completeJson<T>(input: LlmCompleteJsonInput<T>): Promise<T> {
    const parsed = parseInstructionRules(input.user);
    return input.schema.parse(parsed) as T;
  }
}

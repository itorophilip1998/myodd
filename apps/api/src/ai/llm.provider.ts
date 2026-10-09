import type { z } from 'zod';

export interface LlmCompleteJsonInput<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

export interface LlmProvider {
  completeJson<T>(input: LlmCompleteJsonInput<T>): Promise<T>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

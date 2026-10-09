import { Injectable, Logger } from '@nestjs/common';
import type { LlmCompleteJsonInput, LlmProvider } from './llm.provider';

@Injectable()
export class AnthropicLlmProvider implements LlmProvider {
  private readonly logger = new Logger(AnthropicLlmProvider.name);

  async completeJson<T>(input: LlmCompleteJsonInput<T>): Promise<T> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Anthropic error ${res.status}: ${text}`);
      throw new Error(`Anthropic request failed: ${res.status}`);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      json.content?.find((c) => c.type === 'text')?.text ?? '{}';
    const match = text.match(/\{[\s\S]*\}/);
    return input.schema.parse(JSON.parse(match?.[0] ?? '{}'));
  }
}

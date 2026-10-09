import { Module } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.provider';
import { OpenAiLlmProvider } from './openai.llm.provider';
import { AnthropicLlmProvider } from './anthropic.llm.provider';
import { StubLlmProvider } from './stub.llm.provider';
import { IntentParserService } from './intent-parser.service';

@Module({
  providers: [
    OpenAiLlmProvider,
    AnthropicLlmProvider,
    StubLlmProvider,
    {
      provide: LLM_PROVIDER,
      inject: [OpenAiLlmProvider, AnthropicLlmProvider, StubLlmProvider],
      useFactory: (
        openai: OpenAiLlmProvider,
        anthropic: AnthropicLlmProvider,
        stub: StubLlmProvider,
      ) => {
        const name = (process.env.LLM_PROVIDER ?? 'stub').toLowerCase();
        if (name === 'openai') return openai;
        if (name === 'anthropic') return anthropic;
        return stub;
      },
    },
    IntentParserService,
  ],
  exports: [IntentParserService, LLM_PROVIDER],
})
export class AiModule {}

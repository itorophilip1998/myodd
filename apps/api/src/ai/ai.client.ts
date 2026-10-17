import { BadGatewayException, Injectable } from '@nestjs/common';
import { generationConfigSchema, type BookmakerFixture, type BookmakerSelection, type GenerationConfig, type ScoredSelection } from '@myodd/shared';

export interface GenerationReport {
  notices: string[];
  needsExpansion: boolean;
  effectiveConfig: GenerationConfig;
  diagnostics: { requestedSlips: number; foundSlips: number; eligibleEvents: number;
    preferredSelections: number; selectionPool: number;
    oddsBounds: { minimum: number; maximum: number } | null };
}

export interface AiGenerationResult extends GenerationReport {
  pool: ScoredSelection[];
  candidates: Array<{ selections: ScoredSelection[]; totalOdds: number; slipScore: number; fingerprint: string }>;
  modelVersion: string;
}

/** HTTP boundary only. All intent, prediction, and combination logic lives in Python. */
@Injectable()
export class AiClient {
  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await fetch(`${process.env.AI_SERVICE_URL ?? 'http://localhost:8000'}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS ?? 120000)),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: unknown } | null;
        // Python exposes sanitized provider errors as strings; never forward validation payloads or raw bodies.
        const detail = typeof body?.detail === 'string' ? body.detail.slice(0, 500) : `AI returned HTTP ${response.status}`;
        throw new Error(detail);
      }
      return await response.json() as T;
    } catch (error) {
      throw new BadGatewayException(`AI service request failed: ${(error as Error).message}`);
    }
  }

  private catalog(instruction: string, fixtures: BookmakerFixture[]) {
    const catalog = new Map<string, { marketId: string; marketName: string; specifier: string;
      outcomes: Array<{ outcomeId: string; outcomeName: string }> }>();
    for (const fixture of fixtures) for (const market of fixture.markets) {
      if (!['', '0', 'active', 'open'].includes(market.status.toLowerCase())) continue;
      const key = `${market.marketId}|${market.specifier}`;
      const entry = catalog.get(key) ?? { marketId: market.marketId, marketName: market.marketName,
        specifier: market.specifier, outcomes: [] };
      for (const outcome of market.outcomes) if (outcome.isActive && !entry.outcomes.some(o => o.outcomeId === outcome.outcomeId)) {
        entry.outcomes.push({ outcomeId: outcome.outcomeId, outcomeName: outcome.outcomeName });
      }
      catalog.set(key, entry);
    }
    const terms = instruction.toLowerCase().match(/[a-z]+|[0-9]+(?:\.[0-9]+)?/g) ?? [];
    const score = (market: { marketName: string; specifier: string; outcomes: Array<{ outcomeName: string }> }) => {
      const label = `${market.marketName} ${market.specifier} ${market.outcomes.map(o => o.outcomeName).join(' ')}`.toLowerCase();
      const interval = /(?:[0-9]+\s*(?:min|mind)|minute|[0-9]+\s*(?:to|[-–])\s*[0-9]+\s*draw)/i.test(instruction);
      const minuteMarket = /min(?:ute)?s?\b/i.test(market.marketName);
      const requestedNumbers = instruction.match(/\b(?:5|10|15|20|30)\b/g) ?? [];
      const sameInterval = requestedNumbers.some(number => new RegExp(`\\b${number}\\b`).test(label));
      return terms.reduce((count, term) => count + (label.includes(term) ? 1 : 0), 0)
        + (interval && minuteMarket && sameInterval ? 15 : 0);

    };
    const availableMarkets = [...catalog.values()].filter(m => m.outcomes.length)
      .sort((a, b) => score(b) - score(a)).slice(0, 180);
    return availableMarkets;
  }

  async modelInfo() {
    const response = await fetch(`${process.env.AI_SERVICE_URL ?? 'http://localhost:8000'}/health`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new BadGatewayException('AI model metadata unavailable');
    return response.json();
  }

  async parse(instruction: string, fixtures: BookmakerFixture[] = [], learnedDefaults?: unknown): Promise<GenerationConfig> {
    return generationConfigSchema.parse(await this.post('/intent', { instruction, availableMarkets: this.catalog(instruction, fixtures), learnedDefaults: learnedDefaults ?? {} }));
  }

  async resolve(instruction: string, fixtures: BookmakerFixture[], config: GenerationConfig) {
    return generationConfigSchema.parse(await this.post('/resolve', { instruction, config, availableMarkets: this.catalog(instruction, fixtures) }));
  }

  predict(fixtures: BookmakerFixture[]) {
    return this.post<{ pool: ScoredSelection[]; modelVersion: string }>('/predictions', { fixtures });
  }

  discoverCodes(sources: string[]) {
    return this.post<{ sources: Array<{ url: string; codes: string[]; error: string | null }> }>(
      '/tools/discover-codes', { sources },
    );
  }

  split(fixtures: BookmakerFixture[], config: GenerationConfig, originalSelections: BookmakerSelection[], parts: number) {
    return this.post<AiGenerationResult>('/split', { fixtures, config, originalSelections, parts });
  }

  generate(fixtures: BookmakerFixture[], config: GenerationConfig, originalSelections: BookmakerSelection[] = [], expandedSearch = false) {
    return this.post<AiGenerationResult>('/generate', { fixtures, config, originalSelections, expandedSearch });
  }
}

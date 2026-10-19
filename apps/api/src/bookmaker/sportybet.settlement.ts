import { Injectable, Logger } from '@nestjs/common';
import {
  explicitSettlement,
  hasSettlementConflict,
  settlementKey,
  type SelectionSettlement,
} from '@myodd/shared';
import { RedisService } from '../redis/redis.service';
import { SportyBetClient } from './sportybet.client';

export type LegSettlementMap = Map<string, SelectionSettlement>;

type ParsedShareSettlement = {
  byLeg: Record<string, SelectionSettlement>;
};

/**
 * Fetch settlement hints from the public share page when the JSON API is ambiguous.
 * Prefer UNKNOWN over inventing losses.
 */
@Injectable()
export class SportyBetSettlementService {
  private readonly logger = new Logger(SportyBetSettlementService.name);
  private readonly ttlSeconds = Math.max(30, Number(process.env.SPORTYBET_SETTLEMENT_CACHE_TTL_SEC ?? 90));

  constructor(
    private readonly client: SportyBetClient,
    private readonly redis: RedisService,
  ) {}

  async fetchShareSettlement(code: string, options: { fresh?: boolean } = {}): Promise<LegSettlementMap> {
    const normalized = code.trim().toUpperCase();
    const cacheKey = `sporty:settlement:v2:${this.client.regionCode}:${normalized}`;
    const cached = options.fresh ? null : await this.redis.getJson<ParsedShareSettlement>(cacheKey);
    if (cached?.byLeg) {
      return new Map(Object.entries(cached.byLeg));
    }

    const region = this.client.regionCode;
    const base = process.env.SPORTYBET_API_BASE_URL ?? 'https://www.sportybet.com';
    const url = `${base}/${region}/?shareCode=${encodeURIComponent(normalized)}`;
    let html = '';
    try {
      html = await this.fetchHtml(url);
    } catch (err) {
      this.logger.warn(`Share settlement scrape failed for ${normalized}: ${(err as Error).message}`);
      return new Map();
    }

    const parsed = parseSharePageSettlement(html);
    if (Object.keys(parsed.byLeg).length) {
      await this.redis.setJson(cacheKey, parsed, this.ttlSeconds);
    }
    return new Map(Object.entries(parsed.byLeg));
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; myOdd/0.2; +https://myodd.org)',
        'Accept-Language': 'en-NG,en;q=0.9',
      },
      signal: AbortSignal.timeout(Number(process.env.SPORTYBET_TIMEOUT_MS ?? 15000)),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
}

export function parseSharePageSettlement(html: string): ParsedShareSettlement {
  const byLeg: Record<string, SelectionSettlement> = {};

  const scripts = [
    ...html.matchAll(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/gi),
  ];

  for (const match of scripts) {
    const blob = match[1];
    if (!blob) continue;
    try {
      walkJsonForSettlements(JSON.parse(blob), byLeg);
    } catch {
      // Ignore non-JSON captures.
    }
  }

  return { byLeg };
}

function walkJsonForSettlements(node: unknown, byLeg: Record<string, SelectionSettlement>, depth = 0) {
  if (depth > 12 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonForSettlements(item, byLeg, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const eventId = obj.eventId ?? obj.event_id;
  const marketId = obj.marketId ?? obj.market_id;
  const outcomeId = obj.outcomeId ?? obj.outcome_id;
  if (eventId != null && marketId != null && outcomeId != null) {
    const settlement = explicitSettlement(obj.settleStatus, obj.outcomeStatus, obj.selectionStatus, obj.result);
    if (settlement !== 'UNKNOWN' || hasSettlementConflict(obj.settleStatus, obj.outcomeStatus, obj.selectionStatus, obj.result)) {
      const key = settlementKey({
        eventId: String(eventId), marketId: String(marketId), outcomeId: String(outcomeId),
        specifier: String(obj.specifier ?? ''),
      });
      // Duplicate conflicting rows are ambiguous, including across scripts.
      if (key in byLeg && byLeg[key] !== settlement) byLeg[key] = 'UNKNOWN';
      else byLeg[key] = settlement;
    }
  }
  for (const value of Object.values(obj)) walkJsonForSettlements(value, byLeg, depth + 1);
}

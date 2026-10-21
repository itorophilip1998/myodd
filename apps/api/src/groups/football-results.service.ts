import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type { LegMatchPhase } from './play-leg-status';

type ResultFixture = {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
};

export type MatchEvidence = {
  provider: 'API_FOOTBALL'; fixtureId: number; status: string;
  phase: LegMatchPhase; score: string | null; checkedAt: string;
};

function teamName(value: string) {
  // Preserve age groups, reserve/women markers and every word; never fuzzy-match teams.
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function matchFootballFixture(rows: ResultFixture[], leg: {
  homeTeam?: string; awayTeam?: string; kickoffAt: Date | null;
}): MatchEvidence | null {
  if (!leg.homeTeam || !leg.awayTeam || !leg.kickoffAt || !Number.isFinite(leg.kickoffAt.getTime())) return null;
  const candidates = rows.filter(row => row?.fixture && row?.teams?.home && row?.teams?.away
    && typeof row.teams.home.name === 'string' && typeof row.teams.away.name === 'string'
    && teamName(row.teams.home.name ?? '') === teamName(leg.homeTeam!)
    && teamName(row.teams.away.name ?? '') === teamName(leg.awayTeam!)
    && Math.abs(Date.parse(row.fixture.date) - leg.kickoffAt!.getTime()) <= 60_000);
  if (candidates.length !== 1) return null;
  const row = candidates[0];
  if (!Number.isInteger(row.fixture.id) || row.fixture.id <= 0) return null;
  const status = row.fixture.status?.short;
  const phase: LegMatchPhase = ['FT', 'AET', 'PEN'].includes(status) ? 'finished'
    : ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(status) ? 'live'
    : status === 'NS' ? 'prematch' : 'unknown';
  if (phase === 'unknown') return null;
  const home = row.goals?.home, away = row.goals?.away;
  const score = Number.isInteger(home) && home! >= 0 && Number.isInteger(away) && away! >= 0 ? `${home} : ${away}` : null;
  return { provider: 'API_FOOTBALL', fixtureId: row.fixture.id, status, phase, score, checkedAt: new Date().toISOString() };
}

/** Independent match progress only. A score never implies bookmaker settlement. */
@Injectable()
export class FootballResultsService {
  private readonly logger = new Logger(FootballResultsService.name);
  private readonly pending = new Map<string, Promise<ResultFixture[]>>();
  private readonly recent = new Map<string, { expires: number; rows: ResultFixture[] }>();

  constructor(private readonly redis: RedisService) {}

  async lookup(leg: { homeTeam?: string; awayTeam?: string; kickoffAt: Date | null }): Promise<MatchEvidence | null> {
    const key = (process.env.API_FOOTBALL_KEY ?? '').trim();
    if (!key || !leg.homeTeam || !leg.awayTeam || !leg.kickoffAt || !Number.isFinite(leg.kickoffAt.getTime())) return null;
    const date = leg.kickoffAt.toISOString().slice(0, 10);
    const recent = this.recent.get(date);
    if (recent && recent.expires > Date.now()) return matchFootballFixture(recent.rows, leg);
    // Coalesce requests for the same match day across tickets and concurrent checks.
    let request = this.pending.get(date);
    if (!request) {
      request = this.fetchDate(date, key).then(rows => {
        // Also cool down failed/empty lookups so a long ticket cannot exhaust the quota.
        if (this.recent.size >= 32) this.recent.delete(this.recent.keys().next().value!);
        this.recent.set(date, { expires: Date.now() + 60_000, rows });
        return rows;
      });
      this.pending.set(date, request);
      void request.finally(() => { this.pending.delete(date); });
    }
    return matchFootballFixture(await request, leg);
  }

  private async fetchDate(date: string, key: string): Promise<ResultFixture[]> {
    const cacheKey = `football-results:v1:${date}`;
    const cached = await this.redis.getJson<ResultFixture[]>(cacheKey).catch(() => null);
    if (Array.isArray(cached)) return cached;
    try {
      const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}&timezone=UTC`, {
        headers: { 'x-apisports-key': key, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { errors?: Record<string, unknown> | unknown[]; response?: ResultFixture[] };
      if ((data.errors && Object.keys(data.errors).length) || !Array.isArray(data.response)) {
        throw new Error('Provider rejected the request or returned invalid fixtures');
      }
      await this.redis.setJson(cacheKey, data.response, 60).catch(() => {});
      return data.response;
    } catch (err) {
      this.logger.warn(`Independent match check unavailable: ${(err as Error).message}`);
      return [];
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../redis/redis.service';
import type { MatchEvidence } from './football-results.service';

const team = z.object({
  fullName: z.string().trim().min(1),
  score: z.union([z.string(), z.number()]).nullish(),
  runningScores: z.object({ fulltime: z.union([z.string(), z.number()]).nullish() }).nullish(),
});
const event = z.object({
  id: z.string().min(1), startDateTime: z.string().datetime({ offset: true }),
  home: team, away: team, status: z.string(),
  periodLabel: z.object({ value: z.string() }).nullish(),
  tournament: z.object({ name: z.string(), disambiguatedName: z.string().optional() }),
});
export type BbcEvent = z.infer<typeof event>;
type SavedMatch = { homeTeam?: string; awayTeam?: string; league?: string; kickoffAt: Date | null };

export function normalizeMatchName(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function goals(value: unknown): number | null {
  return /^(?:0|[1-9]\d?)$/.test(String(value)) ? Number(value) : null;
}

export function bbcMatchDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Parse BBC's embedded page data as JSON only; never execute page scripts. */
export function parseBbcResults(html: string, date: string): BbcEvent[] {
  const script = html.match(/window\.__INITIAL_DATA__\s*=\s*("(?:[^"\\]|\\.)*")\s*;/);
  if (!script) throw new Error('BBC results page has no structured match data');
  const state = JSON.parse(JSON.parse(script[1])) as { data?: Record<string, { data?: unknown }> };
  const blocks = Object.entries(state.data ?? {}).filter(([key]) => key.startsWith('sport-data-scores-fixtures?'));
  const blockSchema = z.object({ sport: z.literal('football'), selectedStartDate: z.literal(date), selectedEndDate: z.literal(date),
    eventGroups: z.array(z.object({ secondaryGroups: z.array(z.object({ events: z.array(z.unknown()) })) })) });
  const rows: BbcEvent[] = [];
  let found = false;
  for (const [, value] of blocks) {
    const block = blockSchema.safeParse(value?.data);
    if (!block.success) continue;
    found = true;
    for (const group of block.data.eventGroups) for (const secondary of group.secondaryGroups) {
      for (const raw of secondary.events) {
        const parsed = event.safeParse(raw);
        if (parsed.success) rows.push(parsed.data);
      }
    }
  }
  if (!found) throw new Error('BBC results page does not contain the requested football date');
  return rows;
}

export function matchBbcEvent(rows: BbcEvent[], leg: SavedMatch): MatchEvidence | null {
  if (!leg.homeTeam?.trim() || !leg.awayTeam?.trim() || !leg.kickoffAt || !Number.isFinite(leg.kickoffAt.getTime())) return null;
  const sameName = (a: string, b: string) => normalizeMatchName(a) === normalizeMatchName(b);
  const matches = rows.filter(row => sameName(row.home.fullName, leg.homeTeam!) && sameName(row.away.fullName, leg.awayTeam!)
    && Math.abs(Date.parse(row.startDateTime) - leg.kickoffAt!.getTime()) <= 60_000
    && (!leg.league?.trim() || [row.tournament.name, row.tournament.disambiguatedName].some(name => name && sameName(name, leg.league!))));
  if (matches.length !== 1) return null;
  const row = matches[0], period = row.periodLabel?.value ?? '';
  const phase = row.status === 'PostEvent' && ['FT', 'AET', 'PENS'].includes(period) ? 'finished'
    : row.status === 'MidEvent' ? 'live' : row.status === 'PreEvent' ? 'prematch' : 'unknown';
  if (phase === 'unknown') return null;
  const home = goals(row.home.score), away = goals(row.away.score);
  const fullHome = goals(row.home.runningScores?.fulltime), fullAway = goals(row.away.runningScores?.fulltime);
  return { provider: 'BBC_SPORT', fixtureId: row.id, phase, status: `${row.status}:${period}`,
    score: home !== null && away !== null ? `${home} : ${away}` : null,
    ...(phase === 'finished' && fullHome !== null && fullAway !== null ? { regularTimeScore: { home: fullHome, away: fullAway } } : {}),
    sourceUrl: `https://www.bbc.co.uk/sport/football/scores-fixtures/${bbcMatchDate(leg.kickoffAt)}`,
    checkedAt: new Date().toISOString() };
}

@Injectable()
export class BbcResultsService {
  private readonly logger = new Logger(BbcResultsService.name);
  private readonly dates = new Map<string, { expires: number; request: Promise<BbcEvent[]> }>();
  constructor(private readonly redis: RedisService) {}

  async lookup(leg: SavedMatch): Promise<MatchEvidence | null> {
    if (process.env.BBC_RESULTS_ENABLED === 'false' || !leg.homeTeam || !leg.awayTeam || !leg.kickoffAt || !Number.isFinite(leg.kickoffAt.getTime())) return null;
    const date = bbcMatchDate(leg.kickoffAt);
    let entry = this.dates.get(date);
    if (!entry || entry.expires <= Date.now()) {
      if (this.dates.size >= 32) this.dates.delete(this.dates.keys().next().value!);
      entry = { expires: Date.now() + 60_000, request: this.fetchDate(date) };
      this.dates.set(date, entry);
    }
    return matchBbcEvent(await entry.request, leg);
  }

  private async fetchDate(date: string): Promise<BbcEvent[]> {
    const cacheKey = `bbc-results:v1:${date}`;
    const cached = await this.redis.getJson<unknown>(cacheKey).catch(() => null);
    const validCache = z.array(event).safeParse(cached);
    if (validCache.success) return validCache.data;
    try {
      const response = await fetch(`https://www.bbc.co.uk/sport/football/scores-fixtures/${date}`, {
        headers: { Accept: 'text/html', 'User-Agent': 'myOdd/0.2 (football result checker)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (html.length > 3_000_000) throw new Error('BBC results page exceeds size limit');
      const rows = parseBbcResults(html, date);
      await this.redis.setJson(cacheKey, rows, 60).catch(() => {});
      return rows;
    } catch (err) {
      this.logger.warn(`BBC match check unavailable: ${(err as Error).message}`);
      return [];
    }
  }
}

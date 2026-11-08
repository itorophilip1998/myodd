import { afterEach, describe, expect, it, vi } from 'vitest';
import { FootballResultsService, matchFootballFixture } from '../src/groups/football-results.service';

const kickoffAt = new Date('2026-10-20T15:00:00Z');
const leg = { homeTeam: 'Home FC', awayTeam: 'Away FC', kickoffAt };
const fixture = { fixture: { id: 123, date: kickoffAt.toISOString(), status: { short: 'FT' } },
  teams: { home: { name: 'Home FC' }, away: { name: 'Away FC' } }, goals: { home: 2, away: 1 } };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('independent football fixture evidence', () => {
  it.each(['FT', 'AET', 'PEN'])('recognizes completed matches with status %s without inventing settlement', status => {
    const evidence = matchFootballFixture([{ ...fixture, fixture: { ...fixture.fixture, status: { short: status } } }], leg);
    expect(evidence).toMatchObject({ phase: 'finished', provider: 'API_FOOTBALL', fixtureId: 123, score: '2 : 1' });
    expect(evidence).not.toHaveProperty('result');
  });
  it.each(['PST', 'CANC', 'SUSP', 'ABD', 'AWD', 'WO', 'unknown'])('does not treat %s as completed', status => {
    expect(matchFootballFixture([{ ...fixture, fixture: { ...fixture.fixture, status: { short: status } } }], leg)).toBeNull();
  });
  it('rejects ambiguous, reversed, youth-team, and wrong-date matches', () => {
    expect(matchFootballFixture([fixture, fixture], leg)).toBeNull();
    expect(matchFootballFixture([fixture], { ...leg, homeTeam: leg.awayTeam, awayTeam: leg.homeTeam })).toBeNull();
    expect(matchFootballFixture([fixture], { ...leg, homeTeam: 'Home FC U21' })).toBeNull();
    expect(matchFootballFixture([fixture], { ...leg, kickoffAt: new Date('2026-10-19T15:00:00Z') })).toBeNull();
    expect(matchFootballFixture([fixture], { ...leg, kickoffAt: null })).toBeNull();
  });
  it('ignores malformed fixture data and missing scores', () => {
    expect(matchFootballFixture([{ ...fixture, teams: { home: { name: 123 }, away: { name: 'Away FC' } } } as any], leg)).toBeNull();
    expect(matchFootballFixture([{ ...fixture, goals: { home: null, away: null } }], leg)?.score).toBeNull();
  });
});

describe('independent results requests', () => {
  it('makes no request until a server-side provider key is configured', async () => {
    vi.stubEnv('API_FOOTBALL_KEY', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await new FootballResultsService({} as any).lookup(leg)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('coalesces date lookups and keeps the key in request headers only', async () => {
    vi.stubEnv('API_FOOTBALL_KEY', 'server-test-key');
    const redis = { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn().mockResolvedValue(undefined) };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ errors: [], response: [fixture] }) });
    vi.stubGlobal('fetch', fetcher);
    const service = new FootballResultsService(redis as any);
    const results = await Promise.all([service.lookup(leg), service.lookup(leg)]);
    expect(results.every(r => r?.phase === 'finished')).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('https://v3.football.api-sports.io/fixtures?date=2026-10-20&timezone=UTC');
    expect(fetcher.mock.calls[0][1].headers['x-apisports-key']).toBe('server-test-key');
    expect(redis.setJson).toHaveBeenCalledWith('football-results:v1:2026-10-20', [fixture], 60);
    await service.lookup(leg);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('keeps provider errors unknown and cools down repeated failed checks', async () => {
    vi.stubEnv('API_FOOTBALL_KEY', 'server-test-key');
    const redis = { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn() };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ errors: { token: 'Invalid key' }, response: [fixture] }) });
    vi.stubGlobal('fetch', fetcher);
    const service = new FootballResultsService(redis as any);
    expect(await service.lookup(leg)).toBeNull();
    expect(await service.lookup(leg)).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(redis.setJson).not.toHaveBeenCalled();
  });
});

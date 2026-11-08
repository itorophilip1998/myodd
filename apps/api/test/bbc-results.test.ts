import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BbcResultsService, bbcMatchDate, matchBbcEvent, parseBbcResults } from '../src/groups/bbc-results.service';
import { settlementFromScore } from '../src/groups/score-settlement';

// Reduced structured data captured from BBC Sport's public 20 October results page.
const html = readFileSync(resolve(__dirname, 'fixtures/bbc-results-2026-10-20.html'), 'utf8');
const rows = parseBbcResults(html, '2026-10-20');
const leg = { homeTeam: 'Fenerbahce', awayTeam: 'Slavia Prague', league: 'UEFA Champions League', kickoffAt: new Date('2026-10-20T16:45:00Z') };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('BBC HTML result extraction', () => {
  it('reads real embedded page data and matches accents without fuzzy team matching', () => {
    expect(rows).toHaveLength(2);
    expect(matchBbcEvent(rows, leg)).toMatchObject({ provider: 'BBC_SPORT', phase: 'finished',
      score: '2 : 2', regularTimeScore: { home: 2, away: 2 }, fixtureId: 's-5k7bsvaizwp5ddq43obyh7vv8' });
  });
  it('rejects the wrong date, unstructured prose, and script execution', () => {
    expect(() => parseBbcResults(html, '2026-10-19')).toThrow('requested football date');
    expect(() => parseBbcResults('<p>Fenerbahce 2-2 Slavia Prague FT</p>', '2026-10-20')).toThrow('structured match data');
    expect(() => parseBbcResults('<script>window.__INITIAL_DATA__=process.exit()</script>', '2026-10-20')).toThrow();
  });
  it('refuses ambiguous matches, wrong leagues, different ages/genders, reversed teams and incorrect kickoff', () => {
    expect(matchBbcEvent([...rows, rows[0]], leg)).toBeNull();
    for (const change of [{ league: 'Another league' }, { homeTeam: 'Fenerbahce U21' }, { homeTeam: 'Fenerbahce Women' },
      { homeTeam: leg.awayTeam, awayTeam: leg.homeTeam }, { kickoffAt: new Date('2026-10-20T18:45:00Z') }]) {
      expect(matchBbcEvent(rows, { ...leg, ...change })).toBeNull();
    }
  });
  it('uses the regulation-time score even when extra time and penalties changed the final display', () => {
    const match = matchBbcEvent(rows, { homeTeam: 'Cray Wanderers', awayTeam: 'Bedford Town', league: 'FA Cup', kickoffAt: new Date('2026-10-20T18:45:00Z') })!;
    expect(match).toMatchObject({ phase: 'finished', score: '2 : 2', regularTimeScore: { home: 1, away: 1 } });
    expect(settlementFromScore({ marketId: '18', outcomeId: '13', specifier: 'total=2.5' }, match)).toBe('WON');
  });
  it('uses BBC’s London calendar date near UTC midnight, including daylight saving time', () => {
    expect(bbcMatchDate(new Date('2026-10-20T23:30:00Z'))).toBe('2026-10-21');
    expect(bbcMatchDate(new Date('2026-12-20T23:30:00Z'))).toBe('2026-12-20');
  });
  it.each(['Postponed', 'Cancelled', 'Abandoned', 'PostEvent'])('does not infer completion from %s without an explicit completed period', status => {
    expect(matchBbcEvent([{ ...rows[0], status, periodLabel: { value: 'POSTP' } }], leg)).toBeNull();
  });
});

describe('BBC results fetching', () => {
  it('fetches and parses the public HTML without an API key, coalesces requests and caches the date', async () => {
    vi.stubEnv('API_FOOTBALL_KEY', '');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => html });
    vi.stubGlobal('fetch', fetcher);
    const redis = { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn().mockResolvedValue(undefined) };
    const service = new BbcResultsService(redis as any);
    const results = await Promise.all([service.lookup(leg), service.lookup(leg)]);
    expect(results.every(r => r?.phase === 'finished')).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('https://www.bbc.co.uk/sport/football/scores-fixtures/2026-10-20');
    expect(redis.setJson).toHaveBeenCalledWith('bbc-results:v1:2026-10-20', rows, 60);
  });
  it('keeps blocked requests unknown and cools down instead of retrying every leg', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403 }); vi.stubGlobal('fetch', fetcher);
    const service = new BbcResultsService({ getJson: async () => null } as any);
    expect(await service.lookup(leg)).toBeNull();
    expect(await service.lookup(leg)).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('can be disabled and does not request matches missing their identity or kickoff', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const service = new BbcResultsService({} as any);
    expect(await service.lookup({ ...leg, kickoffAt: null })).toBeNull();
    vi.stubEnv('BBC_RESULTS_ENABLED', 'false');
    expect(await service.lookup(leg)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('score-based standard football selections', () => {
  const match = matchBbcEvent(rows, leg)!; // 2-2 in regulation time.
  it.each([
    ['1', '1', '', 'LOST'], ['1', '2', '', 'WON'], ['1', '3', '', 'LOST'],
    ['10', '9', '', 'WON'], ['10', '10', '', 'LOST'], ['10', '11', '', 'WON'],
    ['29', '74', '', 'WON'], ['29', '76', '', 'LOST'],
    ['18', '12', 'total=2.5', 'WON'], ['18', '13', 'total=2.5', 'LOST'],
    ['18', '12', 'total=4.5', 'LOST'], ['18', '13', 'total=4.5', 'WON'],
    ['18', '12', 'total=2', 'UNKNOWN'], ['18', '12', 'total=2.25', 'UNKNOWN'],
    ['18', '12', 'total=2.5|period=1', 'UNKNOWN'], ['29', '75', '', 'UNKNOWN'],
    ['1', 'toString', '', 'UNKNOWN'], ['999', '1', '', 'UNKNOWN'],
  ])('evaluates market %s outcome %s line %s as %s', (marketId, outcomeId, specifier, result) => {
    expect(settlementFromScore({ marketId, outcomeId, specifier }, match)).toBe(result);
  });
  it('requires regulation scores and a finished match, and rejects special market labels', () => {
    const selection = { marketId: '1', outcomeId: '2', specifier: '' };
    expect(settlementFromScore(selection, { ...match, regularTimeScore: undefined })).toBe('UNKNOWN');
    expect(settlementFromScore(selection, { ...match, phase: 'live' })).toBe('UNKNOWN');
    expect(settlementFromScore({ ...selection, marketName: 'First half result' }, match)).toBe('UNKNOWN');
    expect(settlementFromScore({ marketId: '18', outcomeId: '12', specifier: 'total=2.5', marketName: 'Total corners' }, match)).toBe('UNKNOWN');
  });
  it('evaluates scoreless games and outright winners without treating missing scores as zero', () => {
    const scoreless = { ...match, regularTimeScore: { home: 0, away: 0 } };
    expect(settlementFromScore({ marketId: '29', outcomeId: '76', specifier: '' }, scoreless)).toBe('WON');
    expect(settlementFromScore({ marketId: '18', outcomeId: '13', specifier: 'total=0.5' }, scoreless)).toBe('WON');
    const homeWin = { ...match, regularTimeScore: { home: 3, away: 1 } };
    expect(settlementFromScore({ marketId: '1', outcomeId: '1', specifier: '' }, homeWin)).toBe('WON');
    const awayWin = { ...match, regularTimeScore: { home: 0, away: 2 } };
    expect(settlementFromScore({ marketId: '1', outcomeId: '3', specifier: '' }, awayWin)).toBe('WON');
  });
});

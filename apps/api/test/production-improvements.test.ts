import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION, collectionSaveSchema, collectionTitle, formatAppVersion, generationOutcome, promptMatchDay, resolveMarketIds, uiSettingsSchema } from '@myodd/shared';
import { collectionComplete, completionDates } from '../src/groups/collection-lifecycle';
import { generationFailure } from '../src/common/generation-error';
import { SportyBetClient, SportyBetHttpError } from '../src/bookmaker/sportybet.client';
import { confirmedFinalTicket } from '../../web/src/lib/cache-policy';
import { analyticsPath } from '../../web/src/lib/analytics';
import { DEFAULT_UI_SETTINGS, readUiSettings, writeUiSettings } from '../../web/src/lib/ui-settings';
import { canAccessGroup } from '../src/groups/group-access';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('version, collection inputs, and private access', () => {
  it('formats only valid build hashes and supplies a safe fallback', () => {
    expect(formatAppVersion('ABC1234567')).toBe(`v${APP_VERSION}.abc1234`);
    for (const value of ['local', 'production', '$(secret)', '', undefined]) expect(formatAppVersion(value)).toBe(`v${APP_VERSION}`);
  });
  it('suggests contextual neutral titles and sanitizes saved titles', () => {
    expect(collectionTitle('Weekend selections')).toBe('Weekend Football Picks');
    expect(collectionTitle('use over 1.5')).toBe('Goal Market Picks');
    expect(collectionTitle('')).toBe('My Football Picks');
    expect(collectionSaveSchema.parse({ title: ' Hello\u0000\n ' })).toEqual({ title: 'Hello' });
    expect(collectionSaveSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
  });
  it('distinguishes anonymous drafts from private authenticated drafts', () => {
    const draft = { userSaved: false, isPublic: false, ownerId: 'owner' };
    expect(canAccessGroup(draft)).toBe(false);
    expect(canAccessGroup(draft, 'other')).toBe(false);
    expect(canAccessGroup(draft, 'owner')).toBe(true);
    expect(canAccessGroup({ ...draft, ownerId: null })).toBe(true);
  });
});
describe('provider-grounded markets and result accounting', () => {
  const fixtures: any[] = [{ markets: [{ marketId: '18', marketName: 'Total goals', specifier: 'total=1.5', status: 'active', outcomes: [{ outcomeId: 'over', outcomeName: 'Over 1.5', isActive: true }] }] }];
  it('resolves exact goal lines and reports unsupported choices', () => {
    const result = resolveMarketIds(['goals.over.1.5', 'goals.over.2.5', 'invented'], fixtures);
    expect(result.rules).toEqual([{ marketId: '18', specifier: 'total=1.5', outcomeIds: ['over'] }]);
    expect(result.unavailable).toEqual(['Over 2.5', 'invented']);
  });
  it('resolves tomorrow/weekend in Lagos without mistaking deadlines for selected match days', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    expect(promptMatchDay('Tomorrow football', now)).toEqual({ start: '2026-10-23', end: '2026-10-23' });
    expect(promptMatchDay('Weekend selections', now)).toEqual({ start: '2026-10-24', end: '2026-10-25' });
    expect(promptMatchDay('Before 2099-01-01T12:00:00Z', now)).toBeNull();
  });
  it('resolves the investor markets added to Gambler options', () => {
    const fixtures: any[] = [{ markets: [
      { marketId: '882', marketName: 'Player to score', specifier: 'player=sr:1', status: 'active', outcomes: [{ outcomeId: 'yes', outcomeName: 'Yes', isActive: true }, { outcomeId: 'no', outcomeName: 'No', isActive: true }] },
      { marketId: '166', marketName: 'Total corners', specifier: 'total=9.5', status: 'active', outcomes: [{ outcomeId: 'over', outcomeName: 'Over 9.5', isActive: true }] },
      { marketId: '167', marketName: 'Home team total corners', specifier: 'total=4.5', status: 'active', outcomes: [{ outcomeId: 'under', outcomeName: 'Under 4.5', isActive: true }] },
      { marketId: '201', marketName: 'Total shots on target', specifier: 'total=8.5', status: 'active', outcomes: [{ outcomeId: 'over', outcomeName: 'Over 8.5', isActive: true }] },
      { marketId: '50', marketName: 'Home win either half', specifier: '', status: 'active', outcomes: [{ outcomeId: 'yes', outcomeName: 'Yes', isActive: true }, { outcomeId: 'no', outcomeName: 'No', isActive: true }] },
      { marketId: '48', marketName: 'Home to win both halves', specifier: '', status: 'active', outcomes: [{ outcomeId: 'yes', outcomeName: 'Yes', isActive: true }] },
      { marketId: '29', marketName: 'Both teams to score', specifier: '', status: 'active', outcomes: [{ outcomeId: 'yes', outcomeName: 'Yes', isActive: true }] },
    ] }];
    expect(resolveMarketIds(['player.score.yes'], fixtures).rules).toEqual([{ marketId: '882', specifier: 'player=sr:1', outcomeIds: ['yes'] }]);
    expect(resolveMarketIds(['corners.total'], fixtures).rules.map(rule => rule.marketId)).toEqual(['166']);
    expect(resolveMarketIds(['corners.team'], fixtures).rules.map(rule => rule.marketId)).toEqual(['167']);
    expect(resolveMarketIds(['shots.target'], fixtures).rules.map(rule => rule.marketId)).toEqual(['201']);
    expect(resolveMarketIds(['half.either'], fixtures).rules.map(rule => rule.marketId)).toEqual(['50']);
    expect(resolveMarketIds(['player.score.yes'], fixtures).rules[0].outcomeIds).not.toContain('no');
  });
  it('does not claim suspended or unavailable outcomes are usable', () => {
    expect(resolveMarketIds(['goals.over.1.5'], [{ markets: [{ ...fixtures[0].markets[0], status: 'suspended' }] }] as any).rules).toEqual([]);
  });
  it('accounts for planning shortages separately from failed booking attempts', () => {
    const result = generationOutcome({ id: 'job', status: 'COMPLETED', requestedCount: 10, total: 8, progress: 8, failedCount: 2 });
    expect(result).toMatchObject({ status: 'partial_success', requested: 10, generated: 6, failed: 4 });
    expect(result.errors[0].code).toBe('SHORTAGE');
  });
  it('does not blindly retry an ambiguous provider write', () => {
    expect(generationFailure(new SportyBetHttpError('private upstream context', 'TIMEOUT'), true)).toMatchObject({ code: 'BOOKING_UNCERTAIN', retryable: false });
  });
  it('distinguishes provider failures before planning from genuinely empty results', () => {
    const job = { id: 'job', status: 'FAILED', requestedCount: 10, total: 0, progress: 0, failedCount: 0, error: 'Provider unavailable' };
    expect(generationOutcome(job)).toMatchObject({ status: 'failed', generated: 0, failed: 10, errors: expect.arrayContaining([expect.objectContaining({ message: 'Provider unavailable' })]) });
    expect(generationOutcome({ ...job, error: 'No matching selections', failures: [{ code: 'SHORTAGE', message: 'No matching selections', retryable: false }] }).status).toBe('empty');
  });
});
describe('conservative completion and retention', () => {
  const now = new Date();
  const leg = { result: 'WON', matchPhase: 'finished', resultEvidence: {}, resultCheckedAt: now, matchCheckedAt: now };
  const group = { jobs: [{ status: 'COMPLETED' }], slips: [{ selections: [leg] }] };
  it('requires every match and selection to be final', () => {
    expect(collectionComplete(group)).toBe(true);
    for (const patch of [{ result: 'UNKNOWN' }, { result: 'PENDING' }, { matchPhase: 'live' }, { matchPhase: 'unknown' }, { resultEvidence: null }, { matchCheckedAt: null }]) {
      expect(collectionComplete({ ...group, slips: [{ selections: [{ ...leg, ...patch }] }] })).toBe(false);
    }
    expect(collectionComplete({ ...group, jobs: [{ status: 'RUNNING' }] })).toBe(false);
    expect(collectionComplete({ jobs: [], slips: [] })).toBe(false);
    expect(collectionComplete({ ...group, slips: [{ selections: [] }] })).toBe(false);
  });
  it('does not treat an early winning/lost market as match completion', () => {
    expect(collectionComplete({ ...group, slips: [{ selections: [{ ...leg, result: 'LOST', matchPhase: 'live' }] }] })).toBe(false);
  });
  it('requires fresh settlement as well as fresh progress before deletion', () => {
    expect(collectionComplete(group, new Date(now.getTime() + 1))).toBe(false);
    expect(collectionComplete({ ...group, slips: [{ selections: [{ ...leg, matchCheckedAt: new Date(now.getTime() + 1000) }] }] }, new Date(now.getTime() + 1))).toBe(false);
  });
  it('starts a full 24-hour window on first observation and resets it on corrections', () => {
    expect(completionDates(true, null, now)).toEqual({ completedAt: now, deleteAfter: new Date(now.getTime() + 86400_000) });
    expect(completionDates(false, now, now)).toEqual({ completedAt: null, deleteAfter: null });
  });
});
describe('privacy, settings, and safe caching', () => {
  it('never uses private URL identifiers as analytics paths', () => {
    expect(analyticsPath('/code/PRIVATE')).toBe('/code/ticket');
    expect(analyticsPath('/g/PRIVATE')).toBe('/g/collection');
    expect(analyticsPath('/result/PRIVATE')).toBe('/result/generation');
    expect(analyticsPath('/unexpected/PRIVATE')).toBe('/other');
  });
  it('long-caches only tickets with confirmed final matches and settlements', () => {
    const ticket: any = { result: 'WON', playStatus: 'ALL_PLAYED', playCheckedAt: '2026-10-22T00:00:00Z', selections: [{ result: 'WON', matchPhase: 'finished', resultCheckedAt: '2026-10-22T00:00:00Z' }] };
    expect(confirmedFinalTicket(ticket)).toBe(true);
    expect(confirmedFinalTicket({ ...ticket, result: 'LOST', playStatus: 'LIVE' })).toBe(false);
    expect(confirmedFinalTicket({ ...ticket, selections: [{ result: 'WON', matchPhase: 'live' }] })).toBe(false);
    expect(confirmedFinalTicket({ ...ticket, selections: [] })).toBe(false);
  });
  it('preserves saved mode preferences and rejects removed theme settings', () => {
    let raw = '';
    vi.stubGlobal('window', {}); vi.stubGlobal('localStorage', { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } });
    writeUiSettings({ ...DEFAULT_UI_SETTINGS, defaultMode: 'JAPA' });
    expect(readUiSettings()).toMatchObject({ defaultMode: 'JAPA' });
    expect(uiSettingsSchema.safeParse({ ...DEFAULT_UI_SETTINGS, theme: 'dark' }).success).toBe(false);
  });
  it('deduplicates simultaneous safe reads and never caches booking POSTs', async () => {
    const redis = { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn().mockResolvedValue(undefined) };
    const client = new SportyBetClient(redis as any);
    const request = vi.spyOn(client as any, 'request').mockResolvedValue({ ok: true });
    await Promise.all([client.get('/event', { cacheKey: 'event' }), client.get('/event', { cacheKey: 'event' })]);
    expect(request).toHaveBeenCalledTimes(1);
    await client.post('/orders/share', { selections: [] });
    await client.post('/orders/share', { selections: [] });
    expect(request).toHaveBeenCalledTimes(3);
    expect(redis.setJson).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFromPromptSchema, generationConfigSchema, requestedTicketCount, normalizeUiSettings } from '@myodd/shared';
import { DEFAULT_UI_SETTINGS, MAX_TICKETS, readUiSettings, writeUiSettings } from '../../web/src/lib/ui-settings';
import { readGenerationControls } from '../../web/src/lib/generation-controls';
import { generateGuardrailMessage } from '../../web/src/lib/generate-guardrails';

afterEach(() => vi.unstubAllGlobals());

describe('generation defaults and limits', () => {
  it('defaults to ten tickets with an unfixed one-to-fifty game count', () => {
    expect(DEFAULT_UI_SETTINGS).toMatchObject({ defaultTickets: 10, defaultGames: null, defaultMode: 'INVESTOR', defaultOddsSource: 'manual' });
    expect(MAX_TICKETS).toBe(10);
    expect(generationConfigSchema.parse({})).toMatchObject({ numberOfSlips: 10, minimumSelections: 1, maximumSelections: 50 });
  });
  it('accepts ten tickets with fifty games and rejects oversized ticket and split counts', () => {
    expect(generateFromPromptSchema.safeParse({ instruction: 'Create tickets', ticketCount: 10, gamesPerTicket: 50 }).success).toBe(true);
    for (const extra of [{ ticketCount: 11 }, { splitInto: 11 }, { gamesPerTicket: 51 }]) {
      expect(generateFromPromptSchema.safeParse({ instruction: 'Create tickets', ...extra }).success).toBe(false);
    }
  });
  it('migrates the old default of five and preserves newly saved explicit choices', () => {
    let raw = JSON.stringify({ defaultTickets: 5 });
    const localStorage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
    vi.stubGlobal('window', {}); vi.stubGlobal('localStorage', localStorage);
    expect(readUiSettings().defaultTickets).toBe(10);
    writeUiSettings({ ...DEFAULT_UI_SETTINGS, defaultTickets: 5, defaultGames: 7, defaultOddsSource: 'prompt' });
    expect(readUiSettings()).toMatchObject({ defaultTickets: 5, defaultGames: 7, defaultOddsSource: 'prompt' });
  });
  it('reads typed ticket, exact game, mode and odds choices without treating game ranges as odds', () => {
    expect(readGenerationControls('Create 15 tickets with exactly 7 games per ticket. Japa Mode between 30 and 40 odds.')).toEqual({
      tickets: 15, games: 7, mode: 'JAPA', odds: { minimum: 30, maximum: 40 },
    });
    expect(readGenerationControls('Use between 10 and 20 games per ticket').odds).toBeNull();
    expect(readGenerationControls('Investor Mode then Japa Mode, only 30–40 odds')).toMatchObject({ mode: 'JAPA', odds: { minimum: 30, maximum: 40 } });
  });
  it('rejects incompatible mode/range choices instead of silently clipping explicit odds', () => {
    expect(generateGuardrailMessage({ wantsSplit: false, instruction: '', ticketCount: 10, oddsSource: 'manual',
      rawMinOdds: 20, rawMaxOdds: 50, mode: 'INVESTOR' })).toMatch(/outside the selected mode/);
  });
});

it('normalizes legacy output counts without reducing games per ticket', () => {
  expect(normalizeUiSettings({ defaultTickets: 50, defaultSplitParts: 50, defaultGames: 50 })).toEqual({ defaultTickets: 10, defaultSplitParts: 10, defaultGames: 50 });
});
it('rejects numeric and written oversized prompts before persistence or providers', async () => {
  const { SlipsService } = await import('../src/slips/slips.service');
  const transaction = vi.fn(); const queue = { add: vi.fn() }; const provider = { getBooking: vi.fn() };
  const service = new SlipsService({} as any, provider as any, {} as any, {} as any, { $transaction: transaction } as any, {} as any, queue as any);
  for (const instruction of ['Generate 11 tickets', 'Create eleven tickets', 'Split ABC123 into thirteen', 'Create 50 lower-risk slips']) {
    expect(requestedTicketCount(instruction)).toBeGreaterThan(10);
    expect(generateGuardrailMessage({ instruction, wantsSplit: false, oddsSource: 'prompt' })).toBe('You can generate up to 10 tickets at a time.');
    await expect(service.startGeneration({ instruction })).rejects.toThrow('You can generate up to 10 tickets at a time.');
  }
  expect(transaction).not.toHaveBeenCalled(); expect(queue.add).not.toHaveBeenCalled(); expect(provider.getBooking).not.toHaveBeenCalled();
  expect(requestedTicketCount('50 games per ticket')).toBeUndefined();
  for (const n of [1, 10]) expect(requestedTicketCount(`Create ${n} tickets with 50 games per ticket`)).toBe(n);
});

it('normalizes local defaults and legacy learned output counts independently of games', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ defaultsVersion: 3, defaultTickets: 50, defaultSplitParts: 50, defaultGames: 50 }) });
  expect(readUiSettings()).toMatchObject({ defaultTickets: 10, defaultSplitParts: 10, defaultGames: 50 });
  const { normalizeLearnedPreferences } = await import('../src/learning/preferences');
  expect(normalizeLearnedPreferences({ ticketCount: 50, gamesPerTicket: 50 })).toEqual({ ticketCount: 10, gamesPerTicket: 50 });
});

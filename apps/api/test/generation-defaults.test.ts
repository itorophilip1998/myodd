import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFromPromptSchema, generationConfigSchema } from '@myodd/shared';
import { DEFAULT_UI_SETTINGS, MAX_TICKETS, readUiSettings, writeUiSettings } from '../../web/src/lib/ui-settings';
import { readGenerationControls } from '../../web/src/lib/generation-controls';
import { generateGuardrailMessage } from '../../web/src/lib/generate-guardrails';

afterEach(() => vi.unstubAllGlobals());

describe('generation defaults and limits', () => {
  it('defaults to ten tickets with an unfixed one-to-fifty game count', () => {
    expect(DEFAULT_UI_SETTINGS).toMatchObject({ defaultTickets: 10, defaultGames: null, defaultOddsSource: 'manual' });
    expect(MAX_TICKETS).toBe(50);
    expect(generationConfigSchema.parse({})).toMatchObject({ numberOfSlips: 10, minimumSelections: 1, maximumSelections: 50 });
  });
  it('accepts fifty tickets/games and rejects fifty-one in the API', () => {
    expect(generateFromPromptSchema.safeParse({ instruction: 'Create tickets', ticketCount: 50, gamesPerTicket: 50 }).success).toBe(true);
    for (const extra of [{ ticketCount: 51 }, { gamesPerTicket: 51 }]) {
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

export type UiSettings = {
  soundsEnabled: boolean;
  soundVolume: number;
  progressSounds: boolean;
  toastSounds: boolean;
  defaultMode: 'INVESTOR' | 'GAMBLER' | 'JAPA' | 'LAGOS_LIFE' | null;
  defaultOperation: 'generate' | 'split';
  defaultTickets: number | null;
  /** Null chooses a variable count, up to 50 games per ticket. */
  defaultGames: number | null;
  defaultSplitParts: number | null;
  defaultScope: 'prompt' | 'original_only' | 'upcoming';
  defaultStrict: boolean;
  defaultNearest: boolean;
  defaultOddsSource: 'manual' | 'prompt';
};

export const UI_SETTINGS_KEY = 'myodd-ui-settings-v1';
export const MAX_GAMES_PER_TICKET = 50;
export const MAX_TICKETS = 50;

export const DEFAULT_UI_SETTINGS: UiSettings = {
  soundsEnabled: true,
  soundVolume: 0.55,
  progressSounds: true,
  toastSounds: true,
  /** Always Investor (recommended); kept for storage compat, not user-selectable. */
  defaultMode: 'INVESTOR',
  defaultOperation: 'generate',
  defaultTickets: 10,
  defaultGames: null as null,
  defaultSplitParts: 5,
  defaultScope: 'prompt',
  defaultStrict: false,
  defaultNearest: false,
  defaultOddsSource: 'manual',
};

export function clampVolume(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_UI_SETTINGS.soundVolume;
  return Math.min(1, Math.max(0, value));
}

function clampTickets(value: unknown) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_TICKETS, Math.max(1, Math.round(n)));
}

export function readUiSettings(): UiSettings {
  if (typeof window === 'undefined') return DEFAULT_UI_SETTINGS;
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY);
    if (!raw) return DEFAULT_UI_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UiSettings> & { defaultsVersion?: number };
    // Older releases automatically stored five as the default on first load.
    const tickets = parsed.defaultsVersion !== 2 && parsed.defaultTickets === 5 ? 10 : parsed.defaultTickets;
    return {
      soundsEnabled: parsed.soundsEnabled !== false,
      soundVolume: clampVolume(Number(parsed.soundVolume ?? DEFAULT_UI_SETTINGS.soundVolume)),
      progressSounds: parsed.progressSounds !== false,
      toastSounds: parsed.toastSounds !== false,
      defaultMode: 'INVESTOR',
      defaultOperation: parsed.defaultOperation === 'split' ? 'split' : 'generate',
      defaultTickets: clampTickets(tickets === undefined ? DEFAULT_UI_SETTINGS.defaultTickets : tickets),
      defaultGames: clampTickets(parsed.defaultGames),
      defaultSplitParts: clampTickets(parsed.defaultSplitParts ?? DEFAULT_UI_SETTINGS.defaultSplitParts),
      defaultScope: parsed.defaultScope === 'original_only' || parsed.defaultScope === 'upcoming' || parsed.defaultScope === 'prompt'
        ? parsed.defaultScope
        : DEFAULT_UI_SETTINGS.defaultScope,
      defaultStrict: parsed.defaultStrict === true,
      defaultNearest: parsed.defaultNearest === true,
      defaultOddsSource: parsed.defaultOddsSource === 'prompt' ? 'prompt' : 'manual',
    };
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}

export function writeUiSettings(next: UiSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify({ ...next, defaultsVersion: 2 }));
  } catch {
    /* ignore quota / private mode */
  }
}

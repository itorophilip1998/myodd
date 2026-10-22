import { z } from 'zod';

export const uiSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  soundsEnabled: z.boolean(), soundVolume: z.number().min(0).max(1),
  progressSounds: z.boolean(), toastSounds: z.boolean(),
  defaultMode: z.enum(['INVESTOR', 'GAMBLER', 'JAPA', 'LAGOS_LIFE']).nullable(),
  defaultOperation: z.enum(['generate', 'split']),
  defaultTickets: z.number().int().min(1).max(50).nullable(),
  defaultGames: z.number().int().min(1).max(50).nullable(),
  defaultSplitParts: z.number().int().min(1).max(50).nullable(),
  defaultScope: z.enum(['prompt', 'original_only', 'upcoming']),
  defaultStrict: z.boolean(), defaultNearest: z.boolean(),
  defaultOddsSource: z.enum(['manual', 'prompt']),
}).strict();
export type AccountUiSettings = z.infer<typeof uiSettingsSchema>;

export const collectionSaveSchema = z.object({
  title: z.string().transform(value => value.replace(/[\u0000-\u001f\u007f]/g, '').trim()).pipe(z.string().min(1).max(120)).optional(),
  isPublic: z.boolean().optional(),
}).strict();

export function collectionTitle(instruction = '', tag?: string | null): string {
  const mode = tag || instruction.match(/\b(Investor|Gambler|Japa|Lagos\s*life)\b/i)?.[1];
  const label = mode ? `${mode.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()).replace(/Lagos\s*life/i, 'Lagos Life')} Football Picks`
    : /weekend/i.test(instruction) ? 'Weekend Football Picks'
    : /over|under|goals?|btts|\bgg\b/i.test(instruction) ? 'Goal Market Picks'
    : /double chance|\b1x\b|\bx2\b/i.test(instruction) ? 'Double Chance Picks'
    : 'My Football Picks';
  return label.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
}

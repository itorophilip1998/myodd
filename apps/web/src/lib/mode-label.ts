import type { ModeKey } from '@myodd/shared';

export const MODE_TAG: Record<ModeKey, string> = {
  OVER15_MACHINE: 'Over 1.5',
  INVESTOR: 'Investor',
  STATSMAN: 'Statsman',
  GAMBLER: 'Gambler',
  JAPA: 'Japa',
  LAGOS_LIFE: 'Lagoslife',
};

export function modeTag(mode?: string | null) {
  if (!mode) return null;
  if (mode in MODE_TAG) return MODE_TAG[mode as ModeKey];
  return null;
}

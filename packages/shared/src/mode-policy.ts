export const MODE_ODDS = {
  INVESTOR: { minimum: 1, maximum: 10 },
  GAMBLER: { minimum: 10.01, maximum: 100 },
  JAPA: { minimum: 100.01, maximum: 500 },
  LAGOS_LIFE: { minimum: 500.01, maximum: null },
} as const;
export function withinModeOdds(odds: number, mode?: string | null) {
  if (!Number.isFinite(odds)) return false;
  if (!mode) return true;
  const bounds = MODE_ODDS[mode as keyof typeof MODE_ODDS];
  return !!bounds && odds >= bounds.minimum && (bounds.maximum === null || odds <= bounds.maximum);
}

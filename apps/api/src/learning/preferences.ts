/** Limit legacy output defaults without altering remembered game counts. */
export function normalizeLearnedPreferences(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const preferences = { ...value } as Record<string, unknown>;
  if (typeof preferences.ticketCount === 'number') preferences.ticketCount = Math.min(10, Math.max(1, preferences.ticketCount));
  return preferences;
}

/**
 * Single source of truth for the product version shown in the UI and health checks.
 * Bump this (and root package.json) when you ship user-visible changes.
 */
export const APP_VERSION = '0.2.8';

/** Format e.g. `v0.2.8` or `v0.2.8 · a1b2c3d` when a real deploy git sha is provided. */
export function formatAppVersion(gitSha?: string | null) {
  const raw = gitSha?.trim() ?? '';
  // Ignore env placeholders so UI shows the product version, not “local” / “production”.
  const ignore = !raw || /^(local|production|development|dev|prod|unknown|none)$/i.test(raw);
  const short = ignore ? '' : raw.slice(0, 7);
  return short ? `v${APP_VERSION} · ${short}` : `v${APP_VERSION}`;
}

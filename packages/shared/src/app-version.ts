/**
 * Single source of truth for the product version shown in the UI and health checks.
 * Bump this (and root package.json) when you ship user-visible changes.
 */
export const APP_VERSION = '0.2.3';

/** Format e.g. `v0.2.3` or `v0.2.3 · a1b2c3d` when a deploy git sha is provided. */
export function formatAppVersion(gitSha?: string | null) {
  const short = gitSha?.trim() ? gitSha.trim().slice(0, 7) : '';
  return short ? `v${APP_VERSION} · ${short}` : `v${APP_VERSION}`;
}

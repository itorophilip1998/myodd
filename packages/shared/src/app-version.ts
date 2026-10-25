/**
 * Single source of truth for the product version shown in the UI and health checks.
 * Bump this (and root package.json) when you ship user-visible changes.
 */
export const APP_VERSION = '0.2.21';

/** Format e.g. `v0.2.21` or `v0.2.21.a1b2c3d` when a real deploy git sha is provided. */
export function formatAppVersion(gitSha?: string | null) {
  const raw = gitSha?.trim() ?? '';
  const short = /^[a-f0-9]{6,40}$/i.test(raw) ? raw.slice(0, 7).toLowerCase() : '';
  return short ? `v${APP_VERSION}.${short}` : `v${APP_VERSION}`;
}

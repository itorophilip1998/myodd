// Browser API calls wait for Clerk (or GuestSession) to resolve identity.
let release: (() => void) | undefined;
let ready = new Promise<void>(resolve => { release = resolve; });
let pending = true;
export function pauseApiAuth() {
  if (pending) return;
  pending = true;
  ready = new Promise<void>(resolve => { release = resolve; });
}
export function resolveApiAuth() { pending = false; release?.(); }
export function waitForApiAuth() { return ready; }

import { trackOnce } from './analytics';

const FLOW_KEY = 'myodd-auth-flow';
// A local marker ties an event to an explicit signed-out auth flow. Nothing is
// replayed after consent changes, and restored sessions do not count as logins.
export function beginAuthFlow() {
  try { sessionStorage.setItem(FLOW_KEY, JSON.stringify({ startedAt: Date.now() })); } catch {}
}
export function completeAuthFlow(session: { id: string; createdAt: Date }, userCreatedAt: Date | null) {
  try {
    const raw = sessionStorage.getItem(FLOW_KEY);
    sessionStorage.removeItem(FLOW_KEY);
    if (!raw) return;
    const marker = JSON.parse(raw);
    if (typeof marker.startedAt !== 'number' || Date.now() - marker.startedAt > 30 * 60_000 || marker.startedAt > Date.now()) return;
    if (session.createdAt.getTime() < marker.startedAt - 1000) return;
    const registered = !!userCreatedAt && userCreatedAt.getTime() >= marker.startedAt - 1000 && userCreatedAt.getTime() <= session.createdAt.getTime() + 1000;
    trackOnce(registered ? 'sign_up' : 'login', session.id);
  } catch { /* Analytics must never interrupt authentication. */ }
}

export type EventName = 'page_view' | 'sign_up' | 'login' | 'generate_started' | 'generate_completed' | 'generate_failed' | 'code_copied' | 'collection_saved' | 'collection_published' | 'collection_deleted' | 'market_selected' | 'result_check_started' | 'result_check_completed' | 'share_clicked';
type Counts = { count?: number; requested?: number; generated?: number; failed?: number };
export type EventValues = Counts & { page_path?: string };
const EVENTS: readonly string[] = ['page_view', 'sign_up', 'login', 'generate_started', 'generate_completed', 'generate_failed', 'code_copied', 'collection_saved', 'collection_published', 'collection_deleted', 'market_selected', 'result_check_started', 'result_check_completed', 'share_clicked'];
const PUBLIC_ENTRY_PATHS = ['/', '/about', '/faq', '/terms', '/privacy'];
declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }
export const ANALYTICS_CONSENT_KEY = 'myodd-analytics-consent';
export function analyticsAvailable() {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED === 'true' && /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '');
}
export function analyticsEnabled() {
  try { return analyticsAvailable() && localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'granted'; } catch { return false; }
}
export function analyticsPath(path: string) {
  if (path.startsWith('/g/')) return '/g/collection';
  if (path.startsWith('/code/')) return '/code/ticket';
  if (path.startsWith('/result/')) return '/result/generation';
  if (path.startsWith('/sign-in')) return '/sign-in';
  if (path.startsWith('/sign-up')) return '/sign-up';
  return [...PUBLIC_ENTRY_PATHS, '/generate', '/history', '/settings', '/predictions'].includes(path) ? path : '/other';
}
// Attribution is captured only after consent; no full referrer, search, or hash is retained.
export function entryAttribution() {
  const safe: Record<string, string> = {};
  if (!PUBLIC_ENTRY_PATHS.includes(window.location.pathname)) return safe;
  try {
    const referrer = new URL(document.referrer);
    if (['http:', 'https:'].includes(referrer.protocol) && referrer.origin !== window.location.origin) safe.page_referrer = referrer.origin;
  } catch { /* Empty or malformed referrer. */ }
  const query = new URLSearchParams(window.location.search);
  const labels = {
    utm_source: ['google', 'bing', 'facebook', 'instagram', 'twitter', 'x', 'linkedin', 'whatsapp', 'telegram', 'youtube', 'tiktok', 'newsletter'],
    utm_medium: ['organic', 'cpc', 'ppc', 'paid_social', 'social', 'email', 'referral', 'display', 'affiliate'],
    utm_campaign: ['launch', 'organic', 'social', 'newsletter', 'referral'],
  };
  for (const [input, output] of [['utm_source', 'campaign_source'], ['utm_medium', 'campaign_medium'], ['utm_campaign', 'campaign_name']] as const) {
    const value = query.get(input);
    // Only bounded campaign labels, never arbitrary text, IDs, email, or URLs.
    if (value && value.length <= 50 && labels[input].includes(value.toLowerCase())) safe[output] = value.toLowerCase();
  }
  return safe;
}
export function track(event: EventName, values: EventValues = {}): boolean {
  if (!analyticsEnabled() || !EVENTS.includes(event) || typeof window.gtag !== 'function') return false;
  try {
    const safe: Record<string, number | string> = {};
    for (const key of ['count', 'requested', 'generated', 'failed'] as const) {
      const value = values?.[key];
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) safe[key] = value;
    }
    const path = analyticsPath(window.location.pathname);
    if (event === 'page_view') safe.page_path = path;
    window.gtag('event', event, { ...safe, page_location: `${window.location.origin}${path}`, page_title: `MyOdd ${path}` });
    return true;
  } catch { return false; }
}
export function trackOnce(event: EventName, key: string, values: EventValues = {}) {
  try {
    const storageKey = `myodd-event:${event}:${key}`;
    if (sessionStorage.getItem(storageKey)) return false;
    if (!track(event, values)) return false;
    sessionStorage.setItem(storageKey, 'sent');
    return true;
  } catch { return false; }
}

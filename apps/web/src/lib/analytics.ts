type EventName = 'page_view' | 'generate_started' | 'generate_completed' | 'generate_failed' | 'code_copied' | 'collection_saved' | 'collection_published' | 'collection_deleted' | 'market_selected';
declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }
export const ANALYTICS_CONSENT_KEY = 'myodd-analytics-consent';
export function analyticsEnabled() {
  try { return process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED === 'true' && !!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'granted'; } catch { return false; }
}
export function track(event: EventName, values: { count?: number; requested?: number; generated?: number; failed?: number; page_path?: string } = {}) {
  if (!analyticsEnabled()) return;
  // Only anonymous aggregate values are accepted; never pass arbitrary objects or URLs.
  const { count, requested, generated, failed, page_path } = values;
  const safe = Object.fromEntries(Object.entries({ count, requested, generated, failed, page_path }).filter(([, value]) => value !== undefined));
  const path = analyticsPath(window.location.pathname);
  window.gtag?.('event', event, { ...safe, page_location: `${window.location.origin}${path}`, page_title: `myOdd ${path}`, page_referrer: '' });
}
export function analyticsPath(path: string) {
  if (path.startsWith('/g/')) return '/g/collection';
  if (path.startsWith('/code/')) return '/code/ticket';
  if (path.startsWith('/result/')) return '/result/generation';
  if (path.startsWith('/sign-in')) return '/sign-in';
  if (path.startsWith('/sign-up')) return '/sign-up';
  return ['/', '/generate', '/history', '/settings', '/predictions', '/terms', '/privacy'].includes(path) ? path : '/other';
}

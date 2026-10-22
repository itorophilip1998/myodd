'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ANALYTICS_CONSENT_KEY, analyticsPath, track } from '@/lib/analytics';

export function Analytics() {
  const path = usePathname();
  const lastPage = useRef('');
  const [consent, setConsent] = useState<string | null>(null);
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const available = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED === 'true' && /^G-[A-Z0-9]+$/.test(id ?? '');
  useEffect(() => {
    const sync = () => { try {
      const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
      (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = value !== 'granted';
      setConsent(value);
    } catch {} };
    sync(); window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [id]);
  useEffect(() => {
    if (!available || consent !== 'granted') return;
    const browser = window as unknown as Record<string, unknown>;
    browser[`ga-disable-${id}`] = false;
    if (!document.getElementById('myodd-ga')) {
      window.dataLayer = window.dataLayer ?? [];
      window.gtag = function (..._args: unknown[]) { window.dataLayer!.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      window.gtag('set', { page_location: `${window.location.origin}${analyticsPath(path)}`, page_title: 'myOdd', page_referrer: '' });
      window.gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, ignore_referrer: true });
      const script = document.createElement('script'); script.id = 'myodd-ga'; script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`; document.head.appendChild(script);
    }
    // Override the actual URL/title/referrer so private route identifiers cannot reach GA.
    window.gtag?.('set', { page_location: `${window.location.origin}${analyticsPath(path)}`, page_title: `myOdd ${analyticsPath(path)}`, page_referrer: '' });
    if (lastPage.current !== path) { lastPage.current = path; track('page_view', { page_path: analyticsPath(path) }); }
  }, [available, consent, id, path]);
  function choose(value: string) {
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, value); } catch {}
    if (value !== 'granted') { (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = true; window.gtag?.('consent', 'update', { analytics_storage: 'denied' }); }
    else window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    if (value !== 'granted') lastPage.current = '';
    setConsent(value);
  }
  if (!available) return null;
  return <aside className="analytics-consent" aria-label="Analytics preference">
    {!consent ? <><p>Allow anonymous usage analytics? Prompts, betting codes, and account details are excluded.</p><button onClick={() => choose('granted')}>Allow analytics</button><button onClick={() => choose('denied')}>No thanks</button></>
      : <button onClick={() => choose(consent === 'granted' ? 'denied' : 'granted')}>{consent === 'granted' ? 'Disable' : 'Enable'} usage analytics</button>}
  </aside>;
}

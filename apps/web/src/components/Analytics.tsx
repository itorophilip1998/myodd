'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ANALYTICS_CONSENT_KEY, analyticsAvailable, analyticsPath, entryAttribution, track } from '@/lib/analytics';

type Consent = 'granted' | 'denied' | null;
const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
export function Analytics() {
  const path = usePathname();
  const lastPage = useRef('');
  const [consent, setConsent] = useState<Consent>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const available = analyticsAvailable();
  useEffect(() => {
    const sync = () => {
      let value: Consent = null;
      try { const stored = localStorage.getItem(ANALYTICS_CONSENT_KEY); value = stored === 'granted' || stored === 'denied' ? stored : null; } catch { setStorageFailed(true); }
      (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = value !== 'granted';
      window.gtag?.('consent', 'update', { ...denied, analytics_storage: value === 'granted' ? 'granted' : 'denied' });
      if (value !== 'granted') lastPage.current = '';
      setConsent(value);
    };
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
      window.gtag('consent', 'default', denied);
      window.gtag('consent', 'update', { ...denied, analytics_storage: 'granted' });
      window.gtag('js', new Date());
      window.gtag('set', { page_location: `${window.location.origin}${analyticsPath(path)}`, page_title: 'MyOdd', page_referrer: '', ...entryAttribution() });
      window.gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      const script = document.createElement('script'); script.id = 'myodd-ga'; script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
      script.onerror = () => setLoadFailed(true);
      document.head.appendChild(script);
    }
    window.gtag?.('set', { page_location: `${window.location.origin}${analyticsPath(path)}`, page_title: `MyOdd ${analyticsPath(path)}` });
    if (lastPage.current !== path && track('page_view')) lastPage.current = path;
  }, [available, consent, id, path]);
  function choose(value: Exclude<Consent, null>) {
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, value); setStorageFailed(false); }
    catch {
      setStorageFailed(true);
      // Cannot persist an opt-in: stay denied, without throwing into the app.
      value = 'denied';
    }
    (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = value !== 'granted';
    window.gtag?.('consent', 'update', { ...denied, analytics_storage: value });
    if (value !== 'granted') lastPage.current = '';
    setConsent(value);
  }
  if (!available) return null;
  return <aside className="analytics-consent" aria-label="Analytics preference">
    {!consent ? <><p>Allow optional usage analytics? Prompts, betting codes, and account details are excluded. <Link href="/privacy">Privacy policy</Link></p><button type="button" onClick={() => choose('granted')}>Allow analytics</button><button type="button" onClick={() => choose('denied')}>No thanks</button></>
      : <button type="button" onClick={() => choose(consent === 'granted' ? 'denied' : 'granted')}>{consent === 'granted' ? 'Disable' : 'Enable'} usage analytics</button>}
    {storageFailed && <p role="status">Analytics stays off because this browser could not save your preference.</p>}
    {loadFailed && consent === 'granted' && <p role="status">Analytics could not load. Your MyOdd tools are still available.</p>}
  </aside>;
}

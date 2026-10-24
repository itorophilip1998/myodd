'use client';
import { useEffect, useState } from 'react';
import { normalizeUiSettings } from '@myodd/shared';
import { accountApi } from '@/lib/api';
import { readUiSettings, type UiSettings } from '@/lib/ui-settings';
import { useSettings } from './SettingsProvider';
import { useAccountSession } from './AccountSession';

export function SettingsSync() {
  const { userId, signedIn } = useAccountSession();
  const { hydrate } = useSettings();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const guestKey = 'myodd-settings-guest';
    let local = readUiSettings();
    try {
      const previousAccount = localStorage.getItem('myodd-settings-account');
      if (!signedIn) {
        if (previousAccount) { const raw = JSON.parse(localStorage.getItem(guestKey) ?? 'null'); const guest = raw && normalizeUiSettings(raw); if (guest) hydrate(guest); localStorage.removeItem('myodd-settings-account'); }
        return;
      }
      if (!previousAccount) localStorage.setItem(guestKey, JSON.stringify(local));
      const raw = JSON.parse(localStorage.getItem(`myodd-settings-account:${userId}`) ?? localStorage.getItem(guestKey) ?? 'null'); const accountLocal = raw && normalizeUiSettings(raw);
      if (accountLocal) { local = { ...local, ...accountLocal }; hydrate(local); }
      localStorage.setItem('myodd-settings-account', userId!);
    } catch {}
    if (!signedIn) return;
    let active = true; let ready = false; let sending = false;
    let pending: Partial<UiSettings> = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const key = `myodd-settings-pending:${userId}`;
    try { pending = normalizeUiSettings(JSON.parse(localStorage.getItem(key) ?? '{}')); } catch {}
    function store() { try { localStorage.setItem(key, JSON.stringify(pending)); localStorage.setItem(`myodd-settings-account:${userId}`, JSON.stringify({ ...local, ...pending })); } catch {} }
    async function flush() {
      if (!ready || !active || sending || !Object.keys(pending).length) return;
      sending = true; const patch = pending; pending = {};
      try { await accountApi.updateSettings(patch); if (active) setError(false); }
      catch { pending = { ...patch, ...pending }; if (active) setError(true); }
      finally { sending = false; store(); }
      if (active && Object.keys(pending).length) timer = setTimeout(() => void flush(), 5000);
    }
    const change = (event: Event) => { pending = { ...pending, ...(event as CustomEvent<Partial<UiSettings>>).detail }; local = { ...local, ...pending }; store(); clearTimeout(timer); timer = setTimeout(() => void flush(), 400); };
    window.addEventListener('myodd:settings-change', change);
    void accountApi.settings().then(({ settings }) => {
      if (!active) return;
      const merged = { ...local, ...normalizeUiSettings(settings ?? {}), ...pending };
      local = merged; store();
      hydrate(merged);
      if (!settings) pending = merged;
      ready = true; void flush();
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; clearTimeout(timer); window.removeEventListener('myodd:settings-change', change); };
  }, [userId, signedIn, hydrate, retry]);
  return error ? <p className="settings-sync-error" role="status">Settings saved on this device. Account sync is unavailable. <button onClick={() => setRetry(n => n + 1)}>Retry sync</button></p> : null;
}

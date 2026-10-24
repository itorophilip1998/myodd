'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { playSound, unlockAudio, type SoundId } from '@/lib/sounds';
import { DEFAULT_UI_SETTINGS, readUiSettings, writeUiSettings, type UiSettings } from '@/lib/ui-settings';

type SettingsContextValue = {
  settings: UiSettings;
  update: (patch: Partial<UiSettings>) => void;
  reset: () => void;
  hydrate: (settings: Partial<UiSettings>) => void;
  play: (id: SoundId, opts?: { force?: boolean }) => void;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_UI_SETTINGS,
  update: () => undefined,
  reset: () => undefined,
  hydrate: () => undefined,
  play: () => undefined,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(readUiSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeUiSettings(settings);
  }, [settings, ready]);

  useEffect(() => {
    function unlock() { unlockAudio(); }
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const hydrate = useCallback((patch: Partial<UiSettings>) => setSettings(prev => ({ ...prev, ...patch })), []);

  const update = useCallback((patch: Partial<UiSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
    window.dispatchEvent(new CustomEvent('myodd:settings-change', { detail: patch }));
  }, []);

  const reset = useCallback(() => update(DEFAULT_UI_SETTINGS), [update]);

  const play = useCallback((id: SoundId, opts?: { force?: boolean }) => {
    const enabled = opts?.force || settings.soundsEnabled;
    if (!enabled && !opts?.force) return;
    if (id === 'toast' && !settings.toastSounds && !opts?.force) return;
    if ((id === 'progress' || id === 'tick') && !settings.progressSounds && !opts?.force) return;
    playSound(id, { enabled: true, volume: settings.soundVolume });
  }, [settings.soundsEnabled, settings.soundVolume, settings.toastSounds, settings.progressSounds]);

  const value = useMemo(
    () => ({ settings, update, reset, hydrate, play }),
    [settings, update, reset, hydrate, play],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export function useUiSound() {
  return useContext(SettingsContext).play;
}

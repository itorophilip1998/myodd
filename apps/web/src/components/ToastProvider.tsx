'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useUiSound } from './SettingsProvider';

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; action?: ToastAction };

type ToastFn = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ToastFn>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const play = useUiSound();
  const toast = useCallback<ToastFn>((message, action) => {
    if (!message.trim()) return;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts(prev => [...prev.slice(-4), { id, message, action }]);
    play('toast');
    window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), action ? 6000 : 3200);
  }, [play]);
  const value = useMemo(() => toast, [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite" aria-relevant="additions">
        {toasts.map(t => (
          <div key={t.id} className="toast-item" role="status">
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  setToasts(prev => prev.filter(x => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

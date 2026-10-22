'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useUiSound } from './SettingsProvider';

type ToastAction = { label: string; onClick: () => void };
type ToastOptions = {
  action?: ToastAction;
  /** Stay until the user closes it. */
  sticky?: boolean;
  duration?: number;
};

type Toast = {
  id: number;
  message: string;
  action?: ToastAction;
  sticky?: boolean;
};

type ToastFn = (message: string, options?: ToastOptions | ToastAction) => void;

const ToastContext = createContext<ToastFn>(() => undefined);

function isAction(value: ToastOptions | ToastAction | undefined): value is ToastAction {
  return !!value && 'label' in value && 'onClick' in value && !('action' in value) && !('sticky' in value) && !('duration' in value);
}

function normalizeOptions(options?: ToastOptions | ToastAction): ToastOptions {
  if (!options) return {};
  if (isAction(options)) return { action: options, sticky: true };
  return options;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const play = useUiSound();

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((message, options) => {
    if (!message.trim()) return;
    const opts = normalizeOptions(options);
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const sticky = !!opts.sticky || !!opts.action;
    setToasts(prev => [...prev.slice(-4), { id, message, action: opts.action, sticky }]);
    play('toast');
    if (!sticky) {
      const ms = opts.duration ?? 3600;
      window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ms);
    }
  }, [play]);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite" aria-relevant="additions">
        {toasts.length > 1 && <button type="button" className="outline-button toast-dismiss-all" onClick={() => setToasts([])}>Dismiss all</button>}
        {toasts.map(t => (
          <div key={t.id} className={`toast-item${t.sticky ? ' is-sticky' : ''}`} role="status">
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useUiSound } from './SettingsProvider';

type ToastAction = { label: string; onClick: () => void };
type ToastOptions = {
  action?: ToastAction;
  /** Compatibility flag: errors receive eight seconds, never indefinite persistence. */
  sticky?: boolean;
  duration?: number;
};
type Toast = { id: number; message: string; action?: ToastAction; duration: number };
type ToastFn = (message: string, options?: ToastOptions | ToastAction) => void;
const ToastContext = createContext<ToastFn>(() => undefined);

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const remaining = useRef(toast.duration);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismiss(toast.id), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [paused, toast.id, dismiss]);
  return <div className="toast-item" role="status" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <span>{toast.message}</span>
    {toast.action && <button type="button" className="toast-action" onClick={() => { toast.action?.onClick(); dismiss(toast.id); }}>{toast.action.label}</button>}
    <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg></button>
  </div>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const play = useUiSound();
  const dismiss = useCallback((id: number) => setToasts(prev => prev.filter(toast => toast.id !== id)), []);
  const toast = useCallback<ToastFn>((message, options) => {
    if (!message.trim()) return;
    const opts: ToastOptions = options && 'label' in options ? { action: options } : options ?? {};
    const requested = opts.duration ?? (opts.sticky || opts.action ? 8000 : 5000);
    const duration = Number.isFinite(requested) ? Math.min(10000, Math.max(2500, requested)) : 5000;
    const id = ++nextId.current;
    setToasts(prev => [...prev.slice(-4), { id, message, action: opts.action, duration }]);
    play('toast');
  }, [play]);
  return <ToastContext.Provider value={toast}>
    {children}
    <div className="toast-host" aria-live="polite" aria-relevant="additions">
      {toasts.length > 1 && <button type="button" className="outline-button toast-dismiss-all" onClick={() => setToasts([])}>Dismiss all</button>}
      {toasts.map(item => <ToastItem key={item.id} toast={item} dismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>;
}
export function useToast() { return useContext(ToastContext); }

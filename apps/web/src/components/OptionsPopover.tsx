'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useUiSound } from './SettingsProvider';

export function OptionsPopover({
  summary,
  open,
  onOpenChange,
  children,
}: {
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const play = useUiSound();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className={`options-control${open ? ' is-open' : ''}`} ref={root}>
      <button
        type="button"
        className="options-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        title="Options"
        onClick={() => { play('click'); onOpenChange(!open); }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
        </svg>
        <span className="options-label">Options</span>
        <span className="options-chip">{summary}</span>
      </button>

      {open && (
        <div className="options-popover" id={panelId} role="dialog" aria-label="Generation options">
          <div className="options-popover-head">
            <div>
              <strong>Options</strong>
              <p>Tickets, odds, variations, and market toggles</p>
            </div>
            <button type="button" className="match-day-icon-btn" aria-label="Close options" onClick={() => onOpenChange(false)}>✕</button>
          </div>
          <div className="compact-options options-popover-body">{children}</div>
        </div>
      )}
    </div>
  );
}

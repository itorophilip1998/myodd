'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { MODE_ODDS, MODE_SELECTION_ODDS, type ModeKey } from '@myodd/shared';

const EXPLANATIONS: Record<ModeKey, string> = {
  INVESTOR: 'Recommended system ticket for lower odds. You choose the match day or a date range. The system matches our 19 provided options to the day’s listed markets — it does not browse extra board options. Mixed targets near 3, 4, 5, and 6. Goal and double-chance picks are ranked from recent finished scores. A ticket can still lose.',
  GAMBLER: 'Same fast path as Investor: provided options on the day’s listed games, mixed targets across 6.1–20. Investor stays recommended for its lower odds. Goal and double-chance picks use the same recent-score ranking. Every selection must still win for an accumulator to win.',
  JAPA: 'High combined odds and greater uncertainty. Expect frequent losing tickets, even when individual selections have shorter prices.',
  LAGOS_LIFE: 'The highest target range. Highly speculative combinations with frequent losses; never treat this mode as an income plan.',
};

export function ModeInfo({ name, mode, termsHash }: { name: string; mode: ModeKey; termsHash: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 0, arrow: 20, above: false });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus({ preventScroll: true }); }
  useEffect(() => {
    if (!open) return;
    function place() {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(320, window.innerWidth - 24);
      const height = panel.current?.offsetHeight ?? 240;
      const left = Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12));
      const above = anchor.bottom + height + 22 > window.innerHeight && anchor.top > height + 22;
      setPosition({ left, top: above ? anchor.top - height - 10 : anchor.bottom + 10, arrow: Math.max(14, Math.min(width - 14, anchor.left + anchor.width / 2 - left)), above });
    }
    trigger.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    place();
    panel.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent) { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); close(true); } }
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <>
    <button ref={trigger} type="button" className="mode-info" aria-label={`About ${name}`} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}><span aria-hidden>i</span></button>
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label={`About ${name}`} tabIndex={-1} className={`mode-tip${position.above ? ' is-above' : ''}`} style={{ left: position.left, top: position.top, '--tip-arrow': `${position.arrow}px` } as CSSProperties}>
      <div className="mode-tip-head"><strong>{name}</strong><button type="button" aria-label="Close mode information" onClick={() => close(true)}>×</button></div>
      <p>{EXPLANATIONS[mode]}</p>
      <dl><div><dt>Ticket odds</dt><dd>{mode === 'INVESTOR' ? 'Mixed targets: 3, 4, 5, 6' : `${MODE_ODDS[mode].minimum}–${MODE_ODDS[mode].maximum ?? 'no maximum'}`}</dd></div><div><dt>Each selection</dt><dd>{MODE_SELECTION_ODDS[mode].minimum}–{MODE_SELECTION_ODDS[mode].maximum}</dd></div></dl>
      <a href={`/terms#${termsHash}`} target="_blank" rel="noopener noreferrer">Learn more <span aria-hidden>↗</span><span className="sr-only"> about {name} (opens in a new tab)</span></a>
    </div>, document.body)}
  </>;
}

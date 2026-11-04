'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { MODE_ODDS, MODE_SELECTION_ODDS, type ModeKey } from '@myodd/shared';

const EXPLANATIONS: Record<ModeKey, string> = {
  OVER15_MACHINE: 'Vedic Lahiri whole-sign chart at kickoff for the home ground. Only Aries rising games. Defaults to this week; use the match-day control for another day or range. Tickets prefer Over 1.5; if that price is under 1.11 the slip takes Over 2.5 instead. Up to 10 tickets at combined odds 4–6; each leg at most 1.25. The same game is never repeated on another ticket in one generation. A ticket can still lose.',
  GOALS_DESK_V2: 'Zi Wei, Omikuji, Lenormand and the desk vote Yes. Over 1.5 needs at least three Yes (all four preferred). Over 2.5 needs all four Yes. Defaults to that calendar day; use the match-day control to pick another day or a range. If Over 1.5 is priced 1.09–1.13 the slip takes Asian Over 2 but keeps it on the Over 1.5 ticket. Over 1.5 itself is taken at 1.14–1.27. Over 2.5 is taken only when all four agree and the price is at most 1.60. The Over 1.5 lane is never mixed with Over 2.5. Over 1.5 lane tickets land at 3–5; Over 2.5 tickets at 4–6. Up to 10 tickets; a thin single day also pulls in the next 1–2 days. A ticket can still lose.',
  INVESTOR: 'Recommended system ticket for lower odds. You choose the match day or a date range. The system matches our 19 provided options to the day’s listed markets — it does not browse extra board options. Mixed targets near 3, 4, 5, and 6. Goal and double-chance picks are ranked from recent finished scores. A ticket can still lose.',
  STATSMAN: 'Statsman is the scoring engine: Elo for 1X2 plus decayed attack/defence for goals, corners, shots and shots on target. Tickets only take goals ≥76%, a side rated 58–65% mapped to team to score, a side ≥66% mapped to 1/over 2.5 or win either half, and corners/shots/SOT ≥76%. Same 3–6 ticket mix as Investor. A ticket can still lose.',
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
      <dl><div><dt>Ticket odds</dt><dd>{mode === 'OVER15_MACHINE' ? 'Up to 10 tickets at 4–6' : mode === 'GOALS_DESK_V2' ? 'Up to 10 · O1.5 lane: 3–5 · O2.5: 4–6' : mode === 'INVESTOR' || mode === 'STATSMAN' ? 'Mixed targets: 3, 4, 5, 6' : `${MODE_ODDS[mode].minimum}–${MODE_ODDS[mode].maximum ?? 'no maximum'}`}</dd></div><div><dt>Each selection</dt><dd>{MODE_SELECTION_ODDS[mode].minimum}–{MODE_SELECTION_ODDS[mode].maximum}</dd></div></dl>
      <a href={`/terms#${termsHash}`} target="_blank" rel="noopener noreferrer">Learn more <span aria-hidden>↗</span><span className="sr-only"> about {name} (opens in a new tab)</span></a>
    </div>, document.body)}
  </>;
}

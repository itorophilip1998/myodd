'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { addLagosDays, lagosDateYmd, matchDayMaxYmd } from '@myodd/shared';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function monthLabel(ymd: string) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function daysInMonth(ymd: string) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function firstWeekday(ymd: string) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
}

function dayYmd(monthAnchor: string, day: number) {
  const [y, m] = monthAnchor.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatChip(start: string, end: string, today: string) {
  if (start === end) {
    if (start === today) return 'Today';
    if (start === addLagosDays(today, 1)) return 'Tomorrow';
    return start.slice(5).replace('-', '/');
  }
  return `${start.slice(5).replace('-', '/')}–${end.slice(5).replace('-', '/')}`;
}

export function MatchDayPicker({
  start,
  end,
  onChange,
  disabled = false,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  disabled?: boolean;
}) {
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(() => lagosDateYmd());
  const [maxDate, setMaxDate] = useState(() => matchDayMaxYmd());
  const [viewMonth, setViewMonth] = useState(() => start.slice(0, 7) + '-01');
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const [pickingEnd, setPickingEnd] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = lagosDateYmd();
      setToday(next);
      setMaxDate(matchDayMaxYmd());
    };
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) {
      setDraftStart(start);
      setDraftEnd(end);
      setPickingEnd(false);
      setViewMonth(start.slice(0, 7) + '-01');
    }
  }, [open, start, end]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const lead = firstWeekday(viewMonth);
    const total = daysInMonth(viewMonth);
    const items: Array<{ ymd: string | null; day: number | null }> = [];
    for (let i = 0; i < lead; i++) items.push({ ymd: null, day: null });
    for (let d = 1; d <= total; d++) items.push({ ymd: dayYmd(viewMonth, d), day: d });
    return items;
  }, [viewMonth]);

  const minMonth = `${today.slice(0, 7)}-01`;
  const maxMonth = `${maxDate.slice(0, 7)}-01`;
  const canPrev = viewMonth > minMonth;
  const canNext = viewMonth < maxMonth;

  function shiftMonth(delta: number) {
    const next = addLagosDays(viewMonth, delta > 0 ? 32 : -1);
    const anchor = `${next.slice(0, 7)}-01`;
    if (anchor < minMonth || anchor > maxMonth) return;
    setViewMonth(anchor);
  }

  function pick(ymd: string) {
    if (ymd < today || ymd > maxDate) return;
    if (!pickingEnd || ymd < draftStart) {
      setDraftStart(ymd);
      setDraftEnd(ymd);
      setPickingEnd(true);
      return;
    }
    setDraftEnd(ymd);
    setPickingEnd(false);
  }

  function apply(nextStart: string, nextEnd: string) {
    onChange(nextStart, nextEnd);
    setOpen(false);
  }

  function confirm() {
    apply(draftStart, pickingEnd ? draftStart : draftEnd);
  }

  const rangeStart = draftStart;
  const rangeEnd = pickingEnd ? draftStart : draftEnd;
  const lo = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
  const hi = rangeStart <= rangeEnd ? rangeEnd : rangeStart;

  return (
    <div className={`match-day-control${open ? ' is-open' : ''}`} ref={root}>
      <button
        type="button"
        className="match-day-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        title="Match days"
        onClick={() => setOpen(v => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
        <span>{formatChip(start, end, today)}</span>
      </button>

      {open && (
        <div className="match-day-popover" id={panelId} role="dialog" aria-label="Select match days">
          <div className="match-day-popover-head">
            <div>
              <strong>Match days</strong>
              <p>{pickingEnd ? 'Tap an end date, or confirm a single day' : 'Tap a day, or drag a range across days'}</p>
            </div>
            <button type="button" className="match-day-icon-btn" aria-label="Close calendar" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="match-day-presets" role="group" aria-label="Quick ranges">
            <button type="button" onClick={() => apply(today, today)}>Today</button>
            <button type="button" onClick={() => { const t = addLagosDays(today, 1); apply(t, t); }}>Tomorrow</button>
            <button type="button" onClick={() => apply(today, addLagosDays(today, 2))}>3 days</button>
            <button type="button" onClick={() => apply(today, maxDate)}>This week</button>
          </div>

          <div className="match-day-month-nav">
            <button type="button" className="match-day-icon-btn" aria-label="Previous month" disabled={!canPrev} onClick={() => shiftMonth(-1)}>‹</button>
            <span>{monthLabel(viewMonth)}</span>
            <button type="button" className="match-day-icon-btn" aria-label="Next month" disabled={!canNext} onClick={() => shiftMonth(1)}>›</button>
          </div>

          <div className="match-day-weekdays" aria-hidden>
            {WEEKDAYS.map(d => <span key={d}>{d}</span>)}
          </div>

          <div className="match-day-grid" role="grid" aria-label={monthLabel(viewMonth)}>
            {cells.map((cell, i) => {
              if (!cell.ymd || cell.day == null) return <span key={`e-${i}`} className="match-day-empty" />;
              const ymd = cell.ymd;
              const disabledDay = ymd < today || ymd > maxDate;
              const isStart = ymd === lo;
              const isEnd = ymd === hi;
              const inRange = ymd >= lo && ymd <= hi;
              const isToday = ymd === today;
              return (
                <button
                  key={ymd}
                  type="button"
                  role="gridcell"
                  disabled={disabledDay}
                  aria-pressed={inRange}
                  className={[
                    'match-day-cell',
                    inRange ? 'in-range' : '',
                    isStart ? 'is-start' : '',
                    isEnd ? 'is-end' : '',
                    isToday ? 'is-today' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => pick(ymd)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="match-day-footer">
            <span>{lo === hi ? lo : `${lo} → ${hi}`}</span>
            <button type="button" className="match-day-apply" onClick={confirm}>
              {lo === hi ? 'Use day' : 'Use range'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MODE_ODDS, clampOddsToMode, lagosDateYmd, matchDayKickoffWindow, matchDayMaxYmd, modeKeyFromLabel, readChatRequest, type ModeKey } from '@myodd/shared';
import { ProgressQuest } from './ProgressQuest';
import { api } from '@/lib/api';

const MODES = [
  { name: 'Investor Mode', key: 'INVESTOR' as const, risk: 'Recommended · low risk', detail: 'Ticket 2–5 · each game 1.10–1.50', icon: '◈', tone: 'investor', recommended: true },
  { name: 'Gambler Mode', key: 'GAMBLER' as const, risk: 'Medium risk', detail: 'Ticket 5.01–20 · each game ≤1.80', icon: '♧', tone: 'gambler', recommended: false },
  { name: 'Japa Mode', key: 'JAPA' as const, risk: 'High risk', detail: 'Ticket 20.01–100 · each game ≤2.00', icon: '↗', tone: 'japa', recommended: false },
  { name: 'Lagoslife Mode', key: 'LAGOS_LIFE' as const, risk: 'Super high risk', detail: 'Ticket 100.01+ · each game ≤2.00', icon: 'ϟ', tone: 'lagos', recommended: false },
];

const TICKET_CHOICES = [1, 3, 5, 10, 15, 20, 30, 50];
const GAME_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

function bandForMode(modeName: string) {
  const key = modeKeyFromLabel(modeName) ?? 'INVESTOR';
  return { key, ...MODE_ODDS[key] };
}

/** Suggested odds windows inside each mode band for one-tap selection. */
function oddsPresets(key: ModeKey): Array<{ label: string; min: number; max: number | null }> {
  switch (key) {
    case 'INVESTOR':
      return [
        { label: '2–5', min: 2, max: 5 },
        { label: '2–3', min: 2, max: 3 },
        { label: '3–4', min: 3, max: 4 },
        { label: '4–5', min: 4, max: 5 },
      ];
    case 'GAMBLER':
      return [
        { label: '5–20', min: 5.01, max: 20 },
        { label: '5–10', min: 5.01, max: 10 },
        { label: '10–15', min: 10, max: 15 },
        { label: '15–20', min: 15, max: 20 },
      ];
    case 'JAPA':
      return [
        { label: '20–100', min: 20.01, max: 100 },
        { label: '20–40', min: 20.01, max: 40 },
        { label: '40–70', min: 40, max: 70 },
        { label: '70–100', min: 70, max: 100 },
      ];
    case 'LAGOS_LIFE':
      return [
        { label: '100+', min: 100.01, max: null },
        { label: '100–500', min: 100.01, max: 500 },
        { label: '500–2k', min: 500, max: 2000 },
        { label: '2k+', min: 2000, max: null },
      ];
  }
}

export function GenerateForm({ initialBookingCode = '', initialInstruction = '', sourceCode, initialMode = '', initialSplitInto, sourceRevision = 0, busy = false }: { initialBookingCode?: string; initialInstruction?: string; sourceCode?: string; initialMode?: string; initialSplitInto?: number; sourceRevision?: number; busy?: boolean }) {
  const router = useRouter();
  const promptId = useId();
  const dateId = useId();
  const bookingCode = sourceCode ?? initialBookingCode;
  const [preferSource, setPreferSource] = useState(false);
  useEffect(() => { if (sourceRevision) setPreferSource(true); }, [sourceRevision]);
  const [instruction, setInstruction] = useState(initialInstruction);
  const [mode, setMode] = useState(() => MODES.find(item => item.name.toLowerCase() === initialMode.replace(/gamler/i, 'Gambler').replace(/lagos[ -]*li(?:f|v)es?/i, 'Lagoslife').toLowerCase())?.name ?? 'Investor Mode');
  const [operation, setOperation] = useState<'auto' | 'generate' | 'split'>(initialSplitInto ? 'split' : 'auto');
  const splitEnabled = operation === 'split';
  const [splitCount, setSplitCount] = useState(() => String(initialSplitInto ?? readChatRequest(initialInstruction).splitInto ?? 5));
  const parsedChat = readChatRequest(instruction);
  const effectiveSplit = splitEnabled ? Number(splitCount) : parsedChat.splitInto;
  const wantsSplit = splitEnabled || (operation === 'auto' && parsedChat.isSplit);
  const edited = useRef(false);
  /** Empty string = take from prompt. */
  const [ticketCount, setTicketCount] = useState('');
  const [gamesCount, setGamesCount] = useState('');
  const modeBand = useMemo(() => bandForMode(mode), [mode]);
  const presets = useMemo(() => oddsPresets(modeBand.key), [modeBand.key]);
  /** `prompt` = odds come from the message; `manual` = Min/Max / presets win. */
  const [oddsSource, setOddsSource] = useState<'manual' | 'prompt'>('manual');
  const [minOdds, setMinOdds] = useState(() => String(bandForMode('Investor Mode').minimum));
  const [maxOdds, setMaxOdds] = useState(() => {
    const max = bandForMode('Investor Mode').maximum;
    return max == null ? '' : String(max);
  });
  useEffect(() => {
    setOddsSource('manual');
    setMinOdds(String(modeBand.minimum));
    setMaxOdds(modeBand.maximum == null ? '' : String(modeBand.maximum));
  }, [modeBand]);
  const [matchDate, setMatchDate] = useState(() => lagosDateYmd());
  const [today, setToday] = useState(() => lagosDateYmd());
  const [maxDate, setMaxDate] = useState(() => matchDayMaxYmd());
  useEffect(() => {
    const sync = () => {
      const nextToday = lagosDateYmd();
      setToday(nextToday);
      setMaxDate(matchDayMaxYmd());
      setMatchDate(current => (current < nextToday ? nextToday : current));
    };
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const matchWindow = matchDayKickoffWindow(matchDate);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  useEffect(() => {
    if (initialInstruction) return;
    void api.preferences().then(({ preferences }) => {
      if (!preferences || edited.current) return;
      const names: Record<string, string> = { INVESTOR: 'Investor Mode', GAMBLER: 'Gambler Mode', JAPA: 'Japa Mode', LAGOS_LIFE: 'Lagoslife Mode' };
      if (preferences.riskMode) setMode(names[preferences.riskMode] ?? '');
      if (preferences.ticketCount) setTicketCount(String(preferences.ticketCount));
      if (preferences.gamesPerTicket) setGamesCount(String(preferences.gamesPerTicket));
      setDefaultsLoaded(true);
    }).catch(() => {});
  }, [initialInstruction]);
  const [scope, setScope] = useState('prompt');
  const [strict, setStrict] = useState(false);
  const [nearest, setNearest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string>();
  function resolvedOdds() {
    if (oddsSource === 'prompt') return null;
    const parsedMin = Number(minOdds);
    const parsedMax = maxOdds.trim() === '' ? null : Number(maxOdds);
    if (!Number.isFinite(parsedMin) || (parsedMax != null && !Number.isFinite(parsedMax))) return null;
    return clampOddsToMode(parsedMin, parsedMax, modeBand.key);
  }
  function applyPreset(min: number, max: number | null) {
    edited.current = true;
    setOddsSource('manual');
    setMinOdds(String(min));
    setMaxOdds(max == null ? '' : String(max));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (loading || busy || (!instruction.trim() && !mode && !splitEnabled && !ticketCount && !gamesCount)) return;
    setSubmittedAt(new Date().toISOString()); setLoading(true); setError(null);
    const typedCode = parsedChat.bookingCode;
    const effectiveCode = (preferSource ? bookingCode : typedCode ?? bookingCode).trim().toUpperCase();
    const dayLabel = matchWindow.within24Hours ? 'today (next 24 hours)' : matchWindow.matchDate;
    const odds = !wantsSplit ? resolvedOdds() : null;
    if (!wantsSplit && oddsSource === 'manual' && !odds) {
      setError('Enter a valid ticket odds range, pick a preset, or choose “From prompt”.'); setLoading(false); return;
    }
    if (!wantsSplit && odds && odds.maximum != null && odds.minimum > odds.maximum) {
      setError('Minimum ticket odds cannot be higher than the maximum.'); setLoading(false); return;
    }
    const uiTickets = !wantsSplit && ticketCount ? Number(ticketCount) : undefined;
    const uiGames = gamesCount ? Number(gamesCount) : undefined;
    if (uiTickets != null && (!Number.isInteger(uiTickets) || uiTickets < 1 || uiTickets > 100)) {
      setError('Choose 1–100 tickets, or leave tickets on “From prompt”.'); setLoading(false); return;
    }
    if (uiGames != null && (!Number.isInteger(uiGames) || uiGames < 1 || uiGames > 30)) {
      setError('Choose 1–30 games per ticket, or leave games on “From prompt”.'); setLoading(false); return;
    }
    const oddsLabel = odds
      ? `Ticket odds between ${odds.minimum} and ${odds.maximum == null ? 'no upper limit' : odds.maximum}.`
      : '';
    const settings = [
      effectiveCode ? `Source code: ${effectiveCode}.` : '',
      wantsSplit ? `Split this code into ${effectiveSplit} parts.` : '',
      uiTickets ? `Generate ${uiTickets} tickets.` : '',
      uiGames ? `Exactly ${uiGames} games per ticket.` : '',
      scope === 'original_only' ? 'Only use the original matches. Do not add new matches.' : scope === 'upcoming' ? 'Use new upcoming matches only.' : '',
      strict ? 'Only use my requested markets.' : '',
      nearest ? 'Closest available odds are allowed if exact target odds cannot be reached.' : '',
      mode ? `Risk mode: ${mode}.` : '',
      oddsLabel,
      !wantsSplit ? `Match day: ${dayLabel}.` : '',
      'Never repeat the same game twice in one ticket.',
    ].filter(Boolean).join(' ');
    const prompt = instruction.trim() || (wantsSplit ? `Split this code into ${effectiveSplit} parts.` : 'Create tickets using my selected settings.');
    if (wantsSplit && (!Number.isInteger(effectiveSplit) || effectiveSplit! < 1 || effectiveSplit! > 100)) {
      setError('Choose 1–100 parts, or type “split into 5 parts”.'); setLoading(false); return;
    }
    try {
      const result = await api.generate({
        bookingCode: effectiveCode || undefined,
        ticketCount: uiTickets,
        gamesPerTicket: uiGames,
        operation: wantsSplit ? 'split' : 'generate',
        splitInto: wantsSplit ? effectiveSplit : undefined,
        matchDate: wantsSplit ? undefined : matchWindow.matchDate,
        // Only send odds when the user chose manual controls; otherwise the prompt/intent wins.
        minimumOdds: odds?.minimum,
        maximumOdds: odds ? odds.maximum : undefined,
        instruction: prompt + (settings ? `\nFinal request settings (take precedence): ${settings}` : ''),
      });
      router.push(`/result/${result.publicId}?job=${result.jobId}`);
    } catch (err) { setError((err as Error).message); setLoading(false); }
  }
  function shortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }
  if (loading) return <ProgressQuest job={{ status: 'PENDING', stage: 'SUBMITTING', stageDetail: 'Waiting for the server to accept your request', createdAt: submittedAt, progress: 0, total: 0, failedCount: 0 }} />;
  return <form onSubmit={submit} className="chat-composer">
    <fieldset className="mode-picker"><legend>Pick your mode <span>Investor recommended for best-ranked tickets</span></legend><div className="mode-grid">{MODES.map(item => <button type="button" key={item.name} aria-pressed={mode === item.name} onClick={() => { edited.current = true; setMode(item.name); }} className={`mode-option ${item.tone} ${mode === item.name ? 'selected' : ''}`}><span className="mode-icon" aria-hidden>{item.icon}</span><span><strong>{item.name}{item.recommended ? <em className="mode-recommended">Recommended</em> : null}</strong><span className="mode-risk">{item.risk}</span><small>{item.detail}</small></span><span className="mode-check" aria-hidden>{mode === item.name ? '✓' : ''}</span></button>)}</div></fieldset>

    {!wantsSplit && <div className="request-controls">
      <div className="select-panel" role="group" aria-label="Ticket counts">
        <div className="ticket-odds-heading">
          <strong>Tickets & games</strong>
          <span>Select here or leave “From prompt”</span>
        </div>
        <div className="count-selects">
          <label>Total tickets
            <select aria-label="Total tickets" value={ticketCount} onChange={e => { edited.current = true; setTicketCount(e.target.value); }}>
              <option value="">From prompt</option>
              {TICKET_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>Games per ticket
            <select aria-label="Games per ticket" value={gamesCount} onChange={e => { edited.current = true; setGamesCount(e.target.value); }}>
              <option value="">From prompt</option>
              {GAME_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <p>Empty means your message controls the count. Selecting a value overrides the prompt.</p>
      </div>

      <div className="ticket-odds-picker" role="group" aria-label="Ticket odds range">
        <div className="ticket-odds-heading">
          <strong>Ticket odds</strong>
          <span>{mode} · {modeBand.minimum}–{modeBand.maximum == null ? '∞' : modeBand.maximum}</span>
        </div>
        <div className="odds-source-tabs" role="group" aria-label="Odds source">
          <button type="button" aria-pressed={oddsSource === 'manual'} className={oddsSource === 'manual' ? 'is-active' : ''} onClick={() => { edited.current = true; setOddsSource('manual'); }}>From options</button>
          <button type="button" aria-pressed={oddsSource === 'prompt'} className={oddsSource === 'prompt' ? 'is-active' : ''} onClick={() => { edited.current = true; setOddsSource('prompt'); }}>From prompt</button>
        </div>
        {oddsSource === 'manual' ? <>
          <div className="odds-presets" role="group" aria-label="Odds presets">
            {presets.map(preset => {
              const active = Number(minOdds) === preset.min && ((preset.max == null && maxOdds.trim() === '') || Number(maxOdds) === preset.max);
              return <button type="button" key={preset.label} aria-pressed={active} className={active ? 'is-active' : ''} onClick={() => applyPreset(preset.min, preset.max)}>{preset.label}</button>;
            })}
          </div>
          <div className="ticket-odds-inputs">
            <label>Min<input type="number" inputMode="decimal" step="0.01" min={modeBand.minimum} max={modeBand.maximum ?? undefined} value={minOdds} onChange={e => { edited.current = true; setOddsSource('manual'); setMinOdds(e.target.value); }} /></label>
            <span className="ticket-odds-sep" aria-hidden>to</span>
            <label>Max{modeBand.maximum == null
              ? <input type="number" inputMode="decimal" step="0.01" min={modeBand.minimum} value={maxOdds} placeholder="No limit" onChange={e => { edited.current = true; setOddsSource('manual'); setMaxOdds(e.target.value); }} />
              : <input type="number" inputMode="decimal" step="0.01" min={modeBand.minimum} max={modeBand.maximum} value={maxOdds} onChange={e => { edited.current = true; setOddsSource('manual'); setMaxOdds(e.target.value); }} />}</label>
          </div>
          <p>Defaults load from the mode (Investor 2–5). Pick a preset or type any value inside the band.</p>
        </> : <p>Odds will be taken from your message (e.g. “only 4–5 odds”). Mode still clamps the final band.</p>}
      </div>

      <div className="match-day-picker">
        <label htmlFor={dateId}>
          <span>Match day</span>
          <input id={dateId} type="date" value={matchDate} min={today} max={maxDate} onChange={e => { edited.current = true; setMatchDate(e.target.value || today); }} />
        </label>
        <p>{matchWindow.within24Hours
          ? 'Default: today · games within the next 24 hours (Africa/Lagos).'
          : `Only games kicking off on ${matchWindow.matchDate} (Africa/Lagos).`}</p>
        {matchDate !== today && <button type="button" className="match-day-reset" onClick={() => { edited.current = true; setMatchDate(today); }}>Use today</button>}
      </div>
    </div>}

    <div className="composer chat-input-box">
      <label htmlFor={promptId} className="sr-only">Message myOdd</label>
      <textarea id={promptId} value={instruction} onChange={e => { edited.current = true; setInstruction(e.target.value); setOperation('auto'); setPreferSource(false); }} onKeyDown={shortcut} maxLength={4000} rows={2} placeholder="Optional: ‘4–5 odds, 10 games, 5 tickets’ — or use the selectors above…" />
      {!preferSource && parsedChat.bookingCode && parsedChat.bookingCode !== bookingCode && <p className="parsed-code-hint">Using {parsedChat.bookingCode} from your message</p>}
      <div className="chat-input-footer"><details className="composer-options"><summary>More options <span>Action & markets</span></summary><div className="composer-settings">
        <div className="settings-heading"><strong>Advanced</strong><span>Optional extras</span></div>
        <div className="options-grid">
          <label>Action<select aria-label="Code operation" value={wantsSplit ? 'split' : 'generate'} onChange={e => { edited.current = true; setOperation(e.target.value as 'generate' | 'split'); }}><option value="generate">Generate variations</option><option value="split">Split a code</option></select></label>
          {wantsSplit && <label>Total parts<input type="number" aria-label="Number of parts" min={1} max={100} step={1} value={splitEnabled ? splitCount : parsedChat.splitInto ?? ''} onChange={e => { edited.current = true; setOperation('split'); setSplitCount(e.target.value); }} /></label>}
          <label className="settings-matches">Matches<select value={scope} onChange={e => setScope(e.target.value)}><option value="prompt">Follow my prompt</option><option value="original_only">Original matches only</option><option value="upcoming">New upcoming matches</option></select></label>
        </div>
        <div className="settings-toggles"><label className="check-option"><input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} />Only requested markets</label><label className="check-option"><input type="checkbox" checked={nearest} onChange={e => setNearest(e.target.checked)} />Allow nearest odds</label></div>
        {defaultsLoaded && <p className="settings-defaults">✧ Your saved defaults are applied</p>}
      </div></details><button className="primary-button" disabled={loading || busy || (!instruction.trim() && !mode && !splitEnabled && !ticketCount && !gamesCount)} type="submit">{loading ? 'Sending…' : busy ? 'Creating codes…' : wantsSplit ? `Split${effectiveSplit ? ` into ${effectiveSplit}` : ' code'}` : 'Generate codes'} <span aria-hidden>↑</span></button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </form>;
}

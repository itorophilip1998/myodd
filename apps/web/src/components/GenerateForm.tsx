'use client';
import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MODE_ODDS, clampOddsToMode, formatAppVersion, lagosDateYmd, matchDayKickoffWindow, matchDayMaxYmd, modeKeyFromLabel, readChatRequest, type ModeKey } from '@myodd/shared';
import { ProgressQuest } from './ProgressQuest';
import { api } from '@/lib/api';
import {
  clearPredictionBook,
  predictionBookPrompt,
  readPredictionBook,
  removePredictionBookPick,
  type PredictionBookPick,
} from '@/lib/prediction-book';

const MODES = [
  { name: 'Investor Mode', key: 'INVESTOR' as const, risk: 'Low risk', detail: '2–5 · legs 1.10–1.50', icon: '◈', tone: 'investor', recommended: true },
  { name: 'Gambler Mode', key: 'GAMBLER' as const, risk: 'Medium', detail: '5.01–20 · legs ≤1.80', icon: '♧', tone: 'gambler', recommended: false },
  { name: 'Japa Mode', key: 'JAPA' as const, risk: 'High', detail: '20.01–100 · legs ≤2.00', icon: '↗', tone: 'japa', recommended: false },
  { name: 'Lagoslife Mode', key: 'LAGOS_LIFE' as const, risk: 'Very high', detail: '100.01+ · legs ≤2.00', icon: 'ϟ', tone: 'lagos', recommended: false },
];

const TICKET_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const GAME_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

function bandForMode(modeName: string) {
  const key = modeKeyFromLabel(modeName) ?? 'INVESTOR';
  return { key, ...MODE_ODDS[key] };
}

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
  const searchParams = useSearchParams();
  const promptId = useId();
  const dateId = useId();
  const bookingCode = sourceCode ?? initialBookingCode;
  const [preferSource, setPreferSource] = useState(false);
  useEffect(() => { if (sourceRevision) setPreferSource(true); }, [sourceRevision]);
  const [predictionBook, setPredictionBook] = useState<PredictionBookPick[]>([]);
  const [instruction, setInstruction] = useState(initialInstruction);
  const [mode, setMode] = useState(() => MODES.find(item => item.name.toLowerCase() === initialMode.replace(/gamler/i, 'Gambler').replace(/lagos[ -]*li(?:f|v)es?/i, 'Lagoslife').toLowerCase())?.name ?? 'Investor Mode');
  const [operation, setOperation] = useState<'auto' | 'generate' | 'split'>(initialSplitInto ? 'split' : 'generate');
  const splitEnabled = operation === 'split';
  const [splitCount, setSplitCount] = useState(() => String(initialSplitInto ?? readChatRequest(initialInstruction).splitInto ?? 5));
  const parsedChat = readChatRequest(instruction);
  const effectiveSplit = splitEnabled ? Number(splitCount) : parsedChat.splitInto;
  const wantsSplit = splitEnabled || (operation === 'auto' && parsedChat.isSplit);
  const edited = useRef(false);
  const [ticketCount, setTicketCount] = useState('5');
  const [gamesCount, setGamesCount] = useState('');
  const modeBand = useMemo(() => bandForMode(mode), [mode]);
  const presets = useMemo(() => oddsPresets(modeBand.key), [modeBand.key]);
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
  const [scope, setScope] = useState('prompt');
  const [strict, setStrict] = useState(false);
  const [nearest, setNearest] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string>();
  const bookApplied = useRef(false);
  useEffect(() => {
    const sync = () => setPredictionBook(readPredictionBook());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('myodd:prediction-book', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('myodd:prediction-book', sync);
    };
  }, []);
  useEffect(() => {
    if (bookApplied.current || searchParams.get('book') !== '1') return;
    const picks = readPredictionBook();
    if (!picks.length) return;
    bookApplied.current = true;
    setPredictionBook(picks);
    setInstruction(predictionBookPrompt(picks));
    setScope('original_only');
    setTicketCount('1');
    setGamesCount(String(picks.length));
    setOddsSource('prompt');
    setOperation('generate');
    setOptionsOpen(true);
    edited.current = true;
  }, [searchParams]);
  useEffect(() => {
    if (initialInstruction) return;
    void api.preferences().then(({ preferences }) => {
      if (!preferences || edited.current) return;
      const names: Record<string, string> = { INVESTOR: 'Investor Mode', GAMBLER: 'Gambler Mode', JAPA: 'Japa Mode', LAGOS_LIFE: 'Lagoslife Mode' };
      if (preferences.riskMode) setMode(names[preferences.riskMode] ?? 'Investor Mode');
      if (preferences.ticketCount) setTicketCount(String(Math.min(10, Math.max(1, preferences.ticketCount))));
      if (preferences.gamesPerTicket) setGamesCount(String(preferences.gamesPerTicket));
    }).catch(() => {});
  }, [initialInstruction]);

  const optionsSummary = useMemo(() => {
    if (wantsSplit) return `Split · ${effectiveSplit || '?'} parts`;
    const tickets = ticketCount || 'prompt';
    const games = gamesCount || 'prompt';
    const odds = oddsSource === 'prompt'
      ? 'odds from prompt'
      : `${minOdds}–${maxOdds.trim() === '' ? '∞' : maxOdds}`;
    return `${mode.replace(' Mode', '')} · ${tickets} tickets · ${games} games · ${odds}`;
  }, [wantsSplit, effectiveSplit, ticketCount, gamesCount, oddsSource, minOdds, maxOdds, mode]);

  function touch() { edited.current = true; if (!optionsOpen) setOptionsOpen(true); }

  function resolvedOdds() {
    if (oddsSource === 'prompt') return null;
    const parsedMin = Number(minOdds);
    const parsedMax = maxOdds.trim() === '' ? null : Number(maxOdds);
    if (!Number.isFinite(parsedMin) || (parsedMax != null && !Number.isFinite(parsedMax))) return null;
    return clampOddsToMode(parsedMin, parsedMax, modeBand.key);
  }
  function applyPreset(min: number, max: number | null) {
    touch();
    setOddsSource('manual');
    setMinOdds(String(min));
    setMaxOdds(max == null ? '' : String(max));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const hasBook = predictionBook.length > 0;
    if (loading || busy || (!instruction.trim() && !mode && !splitEnabled && !ticketCount && !gamesCount && !hasBook)) return;
    setSubmittedAt(new Date().toISOString()); setLoading(true); setError(null);
    const typedCode = parsedChat.bookingCode;
    const effectiveCode = (preferSource ? bookingCode : typedCode ?? bookingCode).trim().toUpperCase();
    const dayLabel = matchWindow.within24Hours ? 'today (next 24 hours)' : matchWindow.matchDate;
    const odds = !wantsSplit && !hasBook ? resolvedOdds() : null;
    if (!wantsSplit && !hasBook && oddsSource === 'manual' && !odds) {
      setError('Enter a valid ticket odds range, pick a preset, or choose “From prompt”.'); setLoading(false); setOptionsOpen(true); return;
    }
    if (!wantsSplit && odds && odds.maximum != null && odds.minimum > odds.maximum) {
      setError('Minimum ticket odds cannot be higher than the maximum.'); setLoading(false); setOptionsOpen(true); return;
    }
    const uiTickets = !wantsSplit && ticketCount ? Number(ticketCount) : undefined;
    const uiGames = gamesCount ? Number(gamesCount) : (hasBook ? predictionBook.length : undefined);
    if (uiTickets != null && (!Number.isInteger(uiTickets) || uiTickets < 1 || uiTickets > 10)) {
      setError('Choose 1–10 tickets.'); setLoading(false); setOptionsOpen(true); return;
    }
    if (uiGames != null && (!Number.isInteger(uiGames) || uiGames < 1 || uiGames > 30)) {
      setError('Choose 1–30 games per ticket.'); setLoading(false); setOptionsOpen(true); return;
    }
    const oddsLabel = odds
      ? `Ticket odds between ${odds.minimum} and ${odds.maximum == null ? 'no upper limit' : odds.maximum}.`
      : '';
    const dateLine = !wantsSplit ? `Match day: ${dayLabel} (${matchWindow.matchDate}).` : '';
    const settings = [
      hasBook ? `Keep these ${predictionBook.length} prediction picks exactly. Original matches only.` : '',
      effectiveCode ? `Source code: ${effectiveCode}.` : '',
      wantsSplit ? `Split this code into ${effectiveSplit} parts.` : '',
      uiTickets ? `Generate ${uiTickets} tickets.` : '',
      uiGames ? `Exactly ${uiGames} games per ticket.` : '',
      hasBook || scope === 'original_only' ? 'Only use the original matches. Do not add new matches.' : scope === 'upcoming' ? 'Use new upcoming matches only.' : '',
      strict ? 'Only use my requested markets.' : '',
      nearest ? 'Closest available odds are allowed if exact target odds cannot be reached.' : '',
      !hasBook && mode ? `Risk mode: ${mode}.` : '',
      oddsLabel,
      dateLine,
      'Never repeat the same game twice in one ticket.',
    ].filter(Boolean).join(' ');
    const basePrompt = instruction.trim()
      || (hasBook ? predictionBookPrompt(predictionBook) : '')
      || (wantsSplit ? `Split this code into ${effectiveSplit} parts.` : 'Create tickets using my selected settings.');
    const prompt = dateLine && !basePrompt.toLowerCase().includes('match day') ? `${basePrompt}\n${dateLine}` : basePrompt;
    if (wantsSplit && (!Number.isInteger(effectiveSplit) || effectiveSplit! < 1 || effectiveSplit! > 10)) {
      setError('Choose 1–10 parts.'); setLoading(false); setOptionsOpen(true); return;
    }
    try {
      const result = await api.generate({
        bookingCode: effectiveCode || undefined,
        ticketCount: uiTickets ?? (hasBook ? 1 : undefined),
        gamesPerTicket: uiGames,
        operation: wantsSplit ? 'split' : 'generate',
        splitInto: wantsSplit ? effectiveSplit : undefined,
        matchDate: wantsSplit ? undefined : matchWindow.matchDate,
        minimumOdds: hasBook ? undefined : odds?.minimum,
        maximumOdds: hasBook ? undefined : (odds ? odds.maximum : undefined),
        instruction: prompt + (settings ? `\nFinal request settings (take precedence): ${settings}` : ''),
        pinnedSelections: hasBook
          ? predictionBook.map((p) => ({
              eventId: p.eventId,
              marketId: p.marketId,
              outcomeId: p.outcomeId,
              specifier: p.specifier ?? '',
              odds: p.odds,
              marketName: p.marketName,
              selectionName: p.selectionName,
              homeTeam: p.homeTeam,
              awayTeam: p.awayTeam,
              league: p.league,
              kickoffAt: p.kickoffAt,
            }))
          : undefined,
      });
      clearPredictionBook();
      setPredictionBook([]);
      router.push(`/result/${result.publicId}?job=${result.jobId}`);
    } catch (err) { setError((err as Error).message); setLoading(false); }
  }
  function shortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }
  if (loading) return <ProgressQuest job={{ status: 'PENDING', stage: 'SUBMITTING', stageDetail: 'Waiting for the server to accept your request', createdAt: submittedAt, progress: 0, total: 0, failedCount: 0 }} />;

  return <form onSubmit={submit} className="chat-composer">
    <div className="composer chat-input-box">
      {predictionBook.length > 0 && (
        <div className="prediction-book-panel" role="region" aria-label="Prediction book picks">
          <div className="prediction-book-panel-head">
            <strong>Prediction book · {predictionBook.length}</strong>
            <button type="button" className="quiet-button" onClick={() => { clearPredictionBook(); setPredictionBook([]); touch(); }}>Clear book</button>
          </div>
          <ul className="prediction-book-list">
            {predictionBook.map((p) => (
              <li key={`${p.eventId}:${p.marketId}:${p.outcomeId}:${p.specifier}`}>
                <span>
                  <b>{p.homeTeam} vs {p.awayTeam}</b>
                  <small>{p.marketName}: {p.selectionName} @ {p.odds}</small>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${p.homeTeam} vs ${p.awayTeam}`}
                  onClick={() => {
                    const next = removePredictionBookPick(p.eventId);
                    setPredictionBook(next);
                    setInstruction(next.length ? predictionBookPrompt(next) : '');
                    if (next.length) setGamesCount(String(next.length));
                    touch();
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="prediction-book-hint">Generate will book these exact myOdd picks on SportyBet.</p>
        </div>
      )}
      <label htmlFor={promptId} className="sr-only">Message myOdd</label>
      <textarea
        id={promptId}
        value={instruction}
        onChange={e => { touch(); setInstruction(e.target.value); setPreferSource(false); }}
        onKeyDown={shortcut}
        maxLength={4000}
        rows={3}
        placeholder={predictionBook.length ? 'Optional note for this prediction book…' : 'Optional note — e.g. ‘only double chance’ or a booking code…'}
      />
      {!preferSource && parsedChat.bookingCode && parsedChat.bookingCode !== bookingCode && <p className="parsed-code-hint">Using {parsedChat.bookingCode} from your message</p>}

      <div className="chat-input-footer">
        {!wantsSplit && (
          <label className="composer-date" htmlFor={dateId} title="Match day">
            <input
              id={dateId}
              type="date"
              aria-label="Match day"
              value={matchDate}
              min={today}
              max={maxDate}
              onChange={e => { touch(); setMatchDate(e.target.value || today); }}
            />
          </label>
        )}

        <details className="composer-options" open={optionsOpen} onToggle={e => setOptionsOpen((e.target as HTMLDetailsElement).open)}>
          <summary>Options <span>{optionsSummary}</span></summary>
          <div className="composer-settings">
            <div className="options-section">
              <div className="settings-heading"><strong>Mode</strong><span>Changes odds band automatically</span></div>
              <div className="mode-grid options-mode-grid" role="group" aria-label="Risk mode">
                {MODES.map(item => (
                  <button
                    type="button"
                    key={item.name}
                    aria-pressed={mode === item.name}
                    onClick={() => { touch(); setMode(item.name); }}
                    className={`mode-option ${item.tone} ${mode === item.name ? 'selected' : ''}`}
                  >
                    <span className="mode-icon" aria-hidden>{item.icon}</span>
                    <span>
                      <strong>{item.name.replace(' Mode', '')}{item.recommended ? <em className="mode-recommended">Rec</em> : null}</strong>
                      <span className="mode-risk">{item.risk}</span>
                      <small>{item.detail}</small>
                    </span>
                    <span className="mode-check" aria-hidden>{mode === item.name ? '✓' : ''}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="options-section">
              <div className="settings-heading"><strong>Variations</strong><span>Generate or split</span></div>
              <div className="options-grid">
                <label>Action
                  <select aria-label="Code operation" value={wantsSplit ? 'split' : 'generate'} onChange={e => { touch(); setOperation(e.target.value as 'generate' | 'split'); }}>
                    <option value="generate">Generate variations</option>
                    <option value="split">Split a code</option>
                  </select>
                </label>
                {wantsSplit ? (
                  <label>Parts
                    <input type="number" aria-label="Number of parts" min={1} max={10} step={1} value={splitEnabled ? splitCount : parsedChat.splitInto ?? ''} onChange={e => { touch(); setOperation('split'); setSplitCount(e.target.value); }} />
                  </label>
                ) : (
                  <>
                    <label>Tickets
                      <select aria-label="Total tickets" value={ticketCount} onChange={e => { touch(); setTicketCount(e.target.value); }}>
                        <option value="">From prompt</option>
                        {TICKET_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <label>Games / ticket
                      <select aria-label="Games per ticket" value={gamesCount} onChange={e => { touch(); setGamesCount(e.target.value); }}>
                        <option value="">From prompt</option>
                        {GAME_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <label className="settings-matches">Matches
                  <select value={scope} onChange={e => { touch(); setScope(e.target.value); }}>
                    <option value="prompt">Follow my prompt</option>
                    <option value="original_only">Original matches only</option>
                    <option value="upcoming">New upcoming matches</option>
                  </select>
                </label>
              </div>
            </div>

            {!wantsSplit && (
              <div className="options-section">
                <div className="settings-heading">
                  <strong>Ticket odds</strong>
                  <span>{modeBand.minimum}–{modeBand.maximum == null ? '∞' : modeBand.maximum}</span>
                </div>
                <div className="odds-source-tabs" role="group" aria-label="Odds source">
                  <button type="button" aria-pressed={oddsSource === 'manual'} className={oddsSource === 'manual' ? 'is-active' : ''} onClick={() => { touch(); setOddsSource('manual'); }}>From options</button>
                  <button type="button" aria-pressed={oddsSource === 'prompt'} className={oddsSource === 'prompt' ? 'is-active' : ''} onClick={() => { touch(); setOddsSource('prompt'); }}>From prompt</button>
                </div>
                {oddsSource === 'manual' && <>
                  <div className="odds-presets" role="group" aria-label="Odds presets">
                    {presets.map(preset => {
                      const active = Number(minOdds) === preset.min && ((preset.max == null && maxOdds.trim() === '') || Number(maxOdds) === preset.max);
                      return <button type="button" key={preset.label} aria-pressed={active} className={active ? 'is-active' : ''} onClick={() => applyPreset(preset.min, preset.max)}>{preset.label}</button>;
                    })}
                  </div>
                  <div className="ticket-odds-inputs">
                    <label>Min<input type="number" inputMode="decimal" step="0.01" min={modeBand.minimum} max={modeBand.maximum ?? undefined} value={minOdds} onChange={e => { touch(); setOddsSource('manual'); setMinOdds(e.target.value); }} /></label>
                    <span className="ticket-odds-sep" aria-hidden>to</span>
                    <label>Max{modeBand.maximum == null
                      ? <input type="number" inputMode="decimal" step="0.01" min={modeBand.minimum} value={maxOdds} placeholder="No limit" onChange={e => { touch(); setOddsSource('manual'); setMaxOdds(e.target.value); }} />
                      : <input type="number" inputMode="decimal" step="0.01" min={modeBand.minimum} max={modeBand.maximum} value={maxOdds} onChange={e => { touch(); setOddsSource('manual'); setMaxOdds(e.target.value); }} />}</label>
                  </div>
                </>}
              </div>
            )}

            <div className="settings-toggles">
              <label className="check-option"><input type="checkbox" checked={strict} onChange={e => { touch(); setStrict(e.target.checked); }} />Only requested markets</label>
              <label className="check-option"><input type="checkbox" checked={nearest} onChange={e => { touch(); setNearest(e.target.checked); }} />Allow nearest odds</label>
            </div>
          </div>
        </details>

        <button className="primary-button" disabled={loading || busy || (!instruction.trim() && !mode && !splitEnabled && !ticketCount && !gamesCount && !predictionBook.length)} type="submit">
          {loading ? 'Sending…' : busy ? 'Creating codes…' : wantsSplit ? `Split${effectiveSplit ? ` into ${effectiveSplit}` : ''}` : predictionBook.length ? 'Book predictions' : 'Generate'} <span aria-hidden>↑</span>
        </button>
      </div>
      <p className="app-version" aria-label="Deployed app version">
        <strong>{formatAppVersion(process.env.NEXT_PUBLIC_APP_GIT_SHA)}</strong>
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </form>;
}

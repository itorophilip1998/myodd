'use client';
import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MAX_TICKET_ODDS, MODE_ODDS, clampOddsToMode, lagosDateYmd, matchDayKickoffWindow, modeKeyFromLabel, previewOddsFromPrompt, readChatRequest, type ModeKey } from '@myodd/shared';
import { ProgressQuest } from './ProgressQuest';
import { MatchDayPicker } from './MatchDayPicker';
import { OptionsPopover } from './OptionsPopover';
import { useSpeechDictation } from '@/hooks/useSpeechDictation';
import { extractPromptFromFile } from '@/lib/prompt-import';
import { api } from '@/lib/api';
import { useSettings, useUiSound } from '@/components/SettingsProvider';
import { useToast } from '@/components/ToastProvider';
import { generateGuardrailMessage } from '@/lib/generate-guardrails';
import { MAX_TICKETS } from '@/lib/ui-settings';
import {
  clearPredictionBook,
  predictionBookPrompt,
  readPredictionBook,
  removePredictionBookPick,
  type PredictionBookPick,
} from '@/lib/prediction-book';

const MODES = [
  { name: 'Investor Mode', key: 'INVESTOR' as const, risk: 'Recommended · low risk', detail: 'Ticket 2–5 · each game 1.10–1.50', icon: '◈', tone: 'investor', recommended: true, termsHash: 'mode-investor' },
  { name: 'Gambler Mode', key: 'GAMBLER' as const, risk: 'Medium risk', detail: 'Ticket 5.01–20 · each game ≤1.80', icon: '♧', tone: 'gambler', recommended: false, termsHash: 'mode-gambler' },
  { name: 'Japa Mode', key: 'JAPA' as const, risk: 'High risk', detail: `Ticket 20.01–${MAX_TICKET_ODDS} · each game ≤2.00`, icon: '↗', tone: 'japa', recommended: false, termsHash: 'mode-japa' },
  { name: 'Lagoslife Mode', key: 'LAGOS_LIFE' as const, risk: 'Super high risk', detail: `Ticket 100.01–${MAX_TICKET_ODDS} · each game ≤2.00`, icon: 'ϟ', tone: 'lagos', recommended: false, termsHash: 'mode-lagos-life' },
];

const TICKET_CHOICES = Array.from({ length: MAX_TICKETS }, (_, i) => i + 1);
const MAX_PROMPT = 4000;

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
        { label: `20–${MAX_TICKET_ODDS}`, min: 20.01, max: MAX_TICKET_ODDS },
        { label: '20–30', min: 20.01, max: 30 },
        { label: '30–40', min: 30, max: 40 },
        { label: '40–50', min: 40, max: MAX_TICKET_ODDS },
      ];
    case 'LAGOS_LIFE':
      return [
        { label: `100+`, min: 100.01, max: null },
        { label: '100–500', min: 100.01, max: 500 },
        { label: '500–2k', min: 500, max: 2000 },
        { label: '2k+', min: 2000, max: null },
      ];
  }
}

function appendPrompt(current: string, addition: string) {
  const next = current.trim() ? `${current.trim()} ${addition.trim()}` : addition.trim();
  return next.slice(0, MAX_PROMPT);
}

export function GenerateForm({ initialBookingCode = '', initialInstruction = '', sourceCode, initialMode = '', initialSplitInto, sourceRevision = 0, busy = false }: { initialBookingCode?: string; initialInstruction?: string; sourceCode?: string; initialMode?: string; initialSplitInto?: number; sourceRevision?: number; busy?: boolean }) {
  const router = useRouter();
  const play = useUiSound();
  const toast = useToast();
  const { settings } = useSettings();
  const promptId = useId();
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const bookingCode = sourceCode ?? initialBookingCode;
  const [preferSource, setPreferSource] = useState(false);
  useEffect(() => { if (sourceRevision) setPreferSource(true); }, [sourceRevision]);
  const [instruction, setInstruction] = useState(initialInstruction);
  // Always land on recommended Investor Mode; user can still switch for a single run.
  const [mode, setMode] = useState('Investor Mode');
  const [operation, setOperation] = useState<'auto' | 'generate' | 'split'>(() => {
    if (initialSplitInto) return 'split';
    return settings.defaultOperation === 'split' ? 'split' : 'generate';
  });
  const splitEnabled = operation === 'split';
  const [splitCount, setSplitCount] = useState(() => String(
    initialSplitInto
      ?? readChatRequest(initialInstruction).splitInto
      ?? settings.defaultSplitParts
      ?? 5,
  ));
  const parsedChat = readChatRequest(instruction);
  const effectiveSplit = splitEnabled ? Number(splitCount) : parsedChat.splitInto;
  const wantsSplit = splitEnabled || (operation === 'auto' && parsedChat.isSplit);
  const edited = useRef(false);
  const [predictionBook, setPredictionBook] = useState<PredictionBookPick[]>([]);
  const [bookOpen, setBookOpen] = useState(false);
  const bookApplied = useRef(false);
  const [ticketCount, setTicketCount] = useState(() => settings.defaultTickets ? String(settings.defaultTickets) : '5');
  const [scope, setScope] = useState(settings.defaultScope);
  const [strict, setStrict] = useState(settings.defaultStrict);
  const [nearest, setNearest] = useState(settings.defaultNearest);
  const modeBand = useMemo(() => bandForMode(mode), [mode]);
  const presets = useMemo(() => oddsPresets(modeBand.key), [modeBand.key]);
  const [oddsSource, setOddsSource] = useState<'manual' | 'prompt'>(() => settings.defaultOddsSource);
  const [minOdds, setMinOdds] = useState(() => String(bandForMode('Investor Mode').minimum));
  const [maxOdds, setMaxOdds] = useState(() => {
    const max = bandForMode('Investor Mode').maximum;
    return max == null ? '' : String(max);
  });
  useEffect(() => {
    if (edited.current) return;
    setOddsSource(settings.defaultOddsSource);
    setMinOdds(String(modeBand.minimum));
    setMaxOdds(modeBand.maximum == null ? '' : String(modeBand.maximum));
  }, [modeBand, settings.defaultOddsSource]);
  useEffect(() => {
    const sync = () => setPredictionBook(readPredictionBook());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('myodd:prediction-book', sync as EventListener);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('myodd:prediction-book', sync as EventListener);
    };
  }, []);
  useEffect(() => {
    if (bookApplied.current || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('book') !== '1') return;
    const picks = readPredictionBook();
    if (!picks.length) return;
    bookApplied.current = true;
    setPredictionBook(picks);
    setInstruction(predictionBookPrompt(picks));
    setScope('original_only');
    setTicketCount('1');
    setOddsSource('prompt');
    setOperation('generate');
    edited.current = true;
  }, []);
  const [rangeStart, setRangeStart] = useState(() => lagosDateYmd());
  const [rangeEnd, setRangeEnd] = useState(() => lagosDateYmd());
  const matchWindow = matchDayKickoffWindow(rangeStart, new Date(), rangeEnd);
  useEffect(() => {
    if (initialInstruction || edited.current) return;
    setMode('Investor Mode');
    if (!initialSplitInto) setOperation(settings.defaultOperation === 'split' ? 'split' : 'generate');
    if (settings.defaultTickets) setTicketCount(String(settings.defaultTickets));
    else if (settings.defaultTickets === null) setTicketCount('');
    if (settings.defaultSplitParts) setSplitCount(String(settings.defaultSplitParts));
    else if (settings.defaultSplitParts === null) setSplitCount('');
    setScope(settings.defaultScope);
    setStrict(settings.defaultStrict);
    setNearest(settings.defaultNearest);
    setOddsSource(settings.defaultOddsSource);
  }, [initialInstruction, initialSplitInto, settings.defaultOperation, settings.defaultTickets, settings.defaultSplitParts, settings.defaultScope, settings.defaultStrict, settings.defaultNearest, settings.defaultOddsSource]);
  useEffect(() => {
    if (initialInstruction || edited.current) return;
    void api.preferences().then(({ preferences }) => {
      if (!preferences || edited.current) return;
      // Mode always stays Investor by default; prefs only fill ticket count gaps.
      if (!settings.defaultTickets && preferences.ticketCount) setTicketCount(String(Math.min(MAX_TICKETS, Math.max(1, preferences.ticketCount))));
    }).catch(() => {});
  }, [initialInstruction, settings.defaultTickets]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string>();

  const speech = useSpeechDictation(text => {
    touch();
    setPreferSource(false);
    setInstruction(current => appendPrompt(current, text));
    toast('Voice added');
  });
  useEffect(() => {
    if (!speech.error) return;
    toast(speech.error, { sticky: true });
    speech.setError('');
  }, [speech.error, speech.setError, toast]);

  const optionsSummary = useMemo(() => {
    if (wantsSplit) return `${effectiveSplit || '?'} parts`;
    const bits = [
      ticketCount ? `${ticketCount} tix` : null,
      oddsSource === 'manual' ? `${minOdds}–${maxOdds.trim() === '' ? String(MAX_TICKET_ODDS) : maxOdds}` : null,
    ].filter(Boolean);
    return bits.join(' · ') || 'defaults';
  }, [wantsSplit, effectiveSplit, ticketCount, oddsSource, minOdds, maxOdds]);

  function touch() { edited.current = true; }

  function resolvedOdds() {
    if (oddsSource === 'prompt') return null;
    const parsedMin = Number(minOdds);
    const parsedMax = maxOdds.trim() === '' ? null : Number(maxOdds);
    if (!Number.isFinite(parsedMin) || (parsedMax != null && !Number.isFinite(parsedMax))) return null;
    return clampOddsToMode(parsedMin, parsedMax, modeBand.key);
  }

  const appliedSummary = useMemo(() => {
    if (wantsSplit) {
      return `Applied: Split into ${effectiveSplit || '?'} · ${mode}`;
    }
    let optionsOdds: { minimum: number; maximum: number | null } | null = null;
    if (oddsSource === 'manual') {
      const parsedMin = Number(minOdds);
      const parsedMax = maxOdds.trim() === '' ? null : Number(maxOdds);
      if (Number.isFinite(parsedMin) && (parsedMax == null || Number.isFinite(parsedMax))) {
        optionsOdds = clampOddsToMode(parsedMin, parsedMax, modeBand.key);
      }
    }
    const fromPrompt = oddsSource === 'prompt' ? previewOddsFromPrompt(instruction) : null;
    const previewOdds = optionsOdds ?? (fromPrompt ? clampOddsToMode(fromPrompt.minimum, fromPrompt.maximum, modeBand.key) : null);
    const oddsBit = previewOdds
      ? `${previewOdds.minimum}–${previewOdds.maximum == null ? MAX_TICKET_ODDS : previewOdds.maximum}${optionsOdds ? '' : ' (from prompt)'}`
      : oddsSource === 'prompt'
        ? 'odds from prompt'
        : 'mode default odds';
    const ticketsBit = ticketCount ? `${ticketCount} tickets` : 'tickets from prompt';
    const dayBit = matchWindow.matchDate === matchWindow.matchDateEnd
      ? matchWindow.label
      : `${matchWindow.matchDate}→${matchWindow.matchDateEnd}`;
    const overrideNote = optionsOdds || ticketCount ? ' · Options win when set' : '';
    return `Applied: ${mode} · ${ticketsBit} · games auto 1–50 · ${oddsBit} · ${dayBit}${overrideNote}`;
  }, [wantsSplit, effectiveSplit, mode, ticketCount, oddsSource, minOdds, maxOdds, instruction, modeBand.key, matchWindow]);

  function applyPreset(min: number, max: number | null) {
    touch();
    setOddsSource('manual');
    setMinOdds(String(min));
    setMaxOdds(max == null ? '' : String(max));
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const { text, truncated } = await extractPromptFromFile(file);
      touch();
      setPreferSource(false);
      setInstruction(text);
      play('import');
      play('prompt');
      toast(truncated ? `Imported ${file.name} (trimmed to ${MAX_PROMPT} characters).` : `Imported ${file.name}.`);
    } catch (e) {
      play('error');
      toast((e as Error).message, { sticky: true });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (loading || busy || (!instruction.trim() && !mode && !splitEnabled && !ticketCount && !predictionBook.length)) return;
    speech.stop();
    const typedCode = parsedChat.bookingCode;
    const effectiveCode = (preferSource ? bookingCode : typedCode ?? bookingCode).trim().toUpperCase();
    const uiTickets = !wantsSplit && ticketCount ? Number(ticketCount) : undefined;
    const rawMin = oddsSource === 'manual' ? Number(minOdds) : null;
    const rawMax = oddsSource === 'manual' ? (maxOdds.trim() === '' ? null : Number(maxOdds)) : null;
    const guard = generateGuardrailMessage({
      wantsSplit,
      instruction,
      ticketCount: uiTickets,
      splitParts: wantsSplit ? Number(effectiveSplit) : undefined,
      rawMinOdds: rawMin,
      rawMaxOdds: rawMax,
      oddsSource,
    });
    if (guard) {
      play('error');
      toast(guard, { sticky: true });
      setOptionsOpen(true);
      return;
    }
    play('submit');
    setSubmittedAt(new Date().toISOString()); setLoading(true);
    const odds = !wantsSplit ? resolvedOdds() : null;
    const oddsLabel = odds
      ? `Ticket odds between ${odds.minimum} and ${odds.maximum == null ? MAX_TICKET_ODDS : odds.maximum}.`
      : '';
    const dateLine = !wantsSplit
      ? (matchWindow.matchDate === matchWindow.matchDateEnd
        ? `Match day: ${matchWindow.label} (${matchWindow.matchDate}).`
        : `Match days: ${matchWindow.matchDate} to ${matchWindow.matchDateEnd}.`)
      : '';
    const settingsLine = [
      predictionBook.length ? `Keep these ${predictionBook.length} prediction picks exactly. Original matches only.` : '',
      effectiveCode ? `Source code: ${effectiveCode}.` : '',
      wantsSplit ? `Split this code into ${effectiveSplit} parts.` : '',
      uiTickets ? `Generate ${uiTickets} tickets.` : '',
      'Vary games per ticket between 1 and 50 unless an exact count is stated in the prompt.',
      scope === 'original_only' ? 'Only use the original matches. Do not add new matches.' : scope === 'upcoming' ? 'Use new upcoming matches only.' : '',
      strict ? 'Only use my requested markets.' : '',
      nearest ? 'Closest available odds are allowed if exact target odds cannot be reached.' : '',
      mode ? `Risk mode: ${mode}.` : '',
      oddsLabel,
      dateLine,
      `Ticket odds must not exceed ${MAX_TICKET_ODDS}.`,
      'Never reuse the same game across tickets in this generation.',
    ].filter(Boolean).join(' ');
    const basePrompt = instruction.trim() || (predictionBook.length ? predictionBookPrompt(predictionBook) : '') || (wantsSplit ? `Split this code into ${effectiveSplit} parts.` : 'Create tickets using my selected settings.');
    const prompt = dateLine && !/match day/i.test(basePrompt) ? `${basePrompt}\n${dateLine}` : basePrompt;
    try {
      const hasBook = predictionBook.length > 0;
      const result = await api.generate({
        bookingCode: effectiveCode || undefined,
        ticketCount: uiTickets ?? (hasBook ? 1 : undefined),
        gamesPerTicket: hasBook ? predictionBook.length : undefined,
        operation: wantsSplit ? 'split' : 'generate',
        splitInto: wantsSplit ? effectiveSplit : undefined,
        matchDate: wantsSplit ? undefined : matchWindow.matchDate,
        minimumOdds: hasBook ? undefined : odds?.minimum,
        maximumOdds: hasBook ? undefined : (odds ? (odds.maximum ?? MAX_TICKET_ODDS) : undefined),
        instruction: prompt + (settingsLine ? `\nFinal request settings (take precedence): ${settingsLine}` : ''),
        pinnedSelections: hasBook
          ? predictionBook.map((pick) => ({
              eventId: pick.eventId,
              marketId: pick.marketId,
              outcomeId: pick.outcomeId,
              specifier: pick.specifier ?? '',
              odds: pick.odds,
              marketName: pick.marketName,
              selectionName: pick.selectionName,
              homeTeam: pick.homeTeam,
              awayTeam: pick.awayTeam,
              league: pick.league,
              kickoffAt: pick.kickoffAt,
            }))
          : undefined,
      });
      if (hasBook) {
        clearPredictionBook();
        setPredictionBook([]);
      }
      router.push(`/result/${result.publicId}?job=${result.jobId}`);
    } catch (err) { play('error'); toast((err as Error).message, { sticky: true }); setLoading(false); }
  }
  function shortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }
  if (loading) {
    return (
      <ProgressQuest
        job={{ status: 'PENDING', stage: 'SUBMITTING', stageDetail: 'Waiting for the server to accept your request', createdAt: submittedAt, progress: 0, total: 0, failedCount: 0 }}
      />
    );
  }

  return <form onSubmit={submit} className="chat-composer">
    <fieldset className="mode-picker">
      <legend>Pick your mode <span>Investor recommended for best-ranked tickets</span></legend>
      <div className="mode-grid">
        {MODES.map(item => (
          <div key={item.name} className={`mode-option-wrap ${item.tone}${mode === item.name ? ' selected' : ''}`}>
            <button
              type="button"
              aria-pressed={mode === item.name}
              onClick={() => { touch(); setMode(item.name); }}
              className={`mode-option ${item.tone}${mode === item.name ? ' selected' : ''}`}
            >
              <span className="mode-icon" aria-hidden>{item.icon}</span>
              <span>
                <strong>
                  {item.name}
                  {item.recommended ? <em className="mode-recommended">Recommended</em> : null}
                </strong>
                <span className="mode-risk">{item.risk}</span>
                <small>{item.detail}</small>
              </span>
              <span className="mode-check" aria-hidden>{mode === item.name ? '✓' : ''}</span>
            </button>
            <Link
              href={`/terms#${item.termsHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mode-info"
              aria-label={`About ${item.name}`}
              title={`Learn about ${item.name}`}
            >
              <span aria-hidden>ⓘ</span>
            </Link>
          </div>
        ))}
      </div>
    </fieldset>

    <div className="composer chat-input-box">
      {predictionBook.length > 0 && (
        <div className="prediction-book-panel" role="region" aria-label="Prediction book picks">
          <div className="prediction-book-panel-head">
            <button
              type="button"
              className="prediction-book-toggle"
              aria-expanded={bookOpen}
              title={bookOpen ? 'Hide booked picks' : 'Show booked picks'}
              onClick={() => setBookOpen(open => !open)}
            >
              <span aria-hidden>{bookOpen ? '▾' : '▸'}</span>
              <strong>Book · {predictionBook.length}</strong>
            </button>
            <button
              type="button"
              className="quiet-button"
              title="Clear prediction book"
              onClick={() => { clearPredictionBook(); setPredictionBook([]); setBookOpen(false); touch(); }}
            >
              Clear
            </button>
          </div>
          {bookOpen && (
            <ul className="prediction-book-list">
              {predictionBook.map((pick) => (
                <li key={`${pick.eventId}:${pick.marketId}:${pick.outcomeId}:${pick.specifier}`}>
                  <span title={`${pick.marketName}: ${pick.selectionName} @ ${pick.odds}`}>
                    <b>{pick.homeTeam} vs {pick.awayTeam}</b>
                    <small>{pick.selectionName} @ {pick.odds}</small>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${pick.homeTeam} vs ${pick.awayTeam}`}
                    title="Remove pick"
                    onClick={() => {
                      const next = removePredictionBookPick(pick.eventId);
                      setPredictionBook(next);
                      setInstruction(next.length ? predictionBookPrompt(next) : '');
                      if (!next.length) setBookOpen(false);
                      touch();
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <label htmlFor={promptId} className="sr-only">Describe your tickets</label>
      <textarea
        id={promptId}
        value={instruction}
        onChange={e => { touch(); setInstruction(e.target.value); setPreferSource(false); }}
        onKeyDown={shortcut}
        maxLength={MAX_PROMPT}
        rows={2}
        placeholder={'Try “5 tickets · 4–5 odds · double chance · tonight…”'}
      />
      {!preferSource && parsedChat.bookingCode && parsedChat.bookingCode !== bookingCode && (
        <p className="parsed-code-hint" title={`Using ${parsedChat.bookingCode} from your message`}>Using {parsedChat.bookingCode}</p>
      )}
      {speech.listening && (
        <p className="composer-live-hint" role="status" title="Tap the mic to stop">
          <span className="live-dot" aria-hidden />
          {speech.interim ? speech.interim : 'Listening…'}
        </p>
      )}
      <p className="applied-settings" role="status" title={appliedSummary}>{appliedSummary}</p>

      <div className="chat-input-footer">
        <div className="composer-tools">
          {!wantsSplit && (
            <MatchDayPicker
              start={rangeStart}
              end={rangeEnd}
              onChange={(s, e) => { touch(); setRangeStart(s); setRangeEnd(e); setOptionsOpen(false); }}
            />
          )}

          <OptionsPopover
            summary={optionsSummary}
            open={optionsOpen}
            onOpenChange={open => { setOptionsOpen(open); }}
          >
            <div className="options-grid">
              <label>Action
                <select aria-label="Code operation" value={wantsSplit ? 'split' : 'generate'} onChange={e => { touch(); setOperation(e.target.value as 'generate' | 'split'); }}>
                  <option value="generate">Variations</option>
                  <option value="split">Split</option>
                </select>
              </label>
              {wantsSplit ? (
                <label>Parts
                  <input type="number" aria-label="Number of parts" min={1} max={10} step={1} value={splitEnabled ? splitCount : parsedChat.splitInto ?? ''} onChange={e => { touch(); setOperation('split'); setSplitCount(e.target.value); }} />
                </label>
              ) : (
                <label>Tickets
                  <select aria-label="Total tickets" value={ticketCount} onChange={e => { touch(); setTicketCount(e.target.value); }}>
                    <option value="">Prompt</option>
                    {TICKET_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              <label>Matches
                <select value={scope} onChange={e => { touch(); setScope(e.target.value as 'prompt' | 'original_only' | 'upcoming'); }}>
                  <option value="prompt">Prompt</option>
                  <option value="original_only">Original</option>
                  <option value="upcoming">Upcoming</option>
                </select>
              </label>
            </div>

            {!wantsSplit && (
              <div className="compact-odds">
                <div className="compact-odds-head">
                  <strong>Odds</strong>
                  <span>{modeBand.minimum}–{modeBand.maximum ?? MAX_TICKET_ODDS}</span>
                  <div className="odds-source-tabs" role="group" aria-label="Odds source">
                    <button type="button" aria-pressed={oddsSource === 'manual'} className={oddsSource === 'manual' ? 'is-active' : ''} onClick={() => { touch(); setOddsSource('manual'); }}>Options</button>
                    <button type="button" aria-pressed={oddsSource === 'prompt'} className={oddsSource === 'prompt' ? 'is-active' : ''} onClick={() => { touch(); setOddsSource('prompt'); }}>Prompt</button>
                  </div>
                </div>
                {oddsSource === 'manual' && <>
                  <div className="odds-presets" role="group" aria-label="Odds presets">
                    {presets.map(preset => {
                      const active = Number(minOdds) === preset.min && ((preset.max == null && maxOdds.trim() === '') || Number(maxOdds) === preset.max);
                      return <button type="button" key={preset.label} aria-pressed={active} className={active ? 'is-active' : ''} onClick={() => applyPreset(preset.min, preset.max)}>{preset.label}</button>;
                    })}
                  </div>
                  <div className="ticket-odds-inputs">
                    <label>Min<input type="number" inputMode="decimal" step="0.01" min={modeBand.minimum} max={modeBand.maximum ?? MAX_TICKET_ODDS} value={minOdds} onChange={e => { touch(); setOddsSource('manual'); setMinOdds(e.target.value); }} /></label>
                    <span className="ticket-odds-sep" aria-hidden>–</span>
                    <label>Max<input type="number" inputMode="decimal" step="0.01" min={modeBand.minimum} max={modeBand.maximum ?? MAX_TICKET_ODDS} value={maxOdds} onChange={e => { touch(); setOddsSource('manual'); setMaxOdds(e.target.value); }} /></label>
                  </div>
                </>}
              </div>
            )}

            <div className="settings-toggles">
              <label className="check-option"><input type="checkbox" checked={strict} onChange={e => { touch(); setStrict(e.target.checked); }} />Only requested markets</label>
              <label className="check-option"><input type="checkbox" checked={nearest} onChange={e => { touch(); setNearest(e.target.checked); }} />Nearest odds OK</label>
            </div>
          </OptionsPopover>

          <button
            type="button"
            className={`composer-icon-btn${speech.listening ? ' is-live' : ''}`}
            aria-pressed={speech.listening}
            title={speech.supported ? (speech.listening ? 'Stop recording' : 'Dictate prompt') : 'Voice not supported here'}
            disabled={!speech.supported || busy}
            onClick={() => { setOptionsOpen(false); speech.setError(''); speech.toggle(); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
            </svg>
            <span className="sr-only">{speech.listening ? 'Stop voice' : 'Start voice'}</span>
          </button>

          <button
            type="button"
            className="composer-icon-btn"
            title="Attach .txt, .pdf, or .docx"
            disabled={importing || busy}
            onClick={() => { setOptionsOpen(false); fileRef.current?.click(); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.5 8.49a1.5 1.5 0 1 1-2.12-2.12l7.78-7.78" />
            </svg>
            <span className="sr-only">{importing ? 'Attaching…' : 'Attach prompt file'}</span>
          </button>
          <input
            id={fileInputId}
            ref={fileRef}
            type="file"
            className="sr-only"
            accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={e => void onImportFile(e.target.files?.[0])}
          />
        </div>

        <button className="primary-button" disabled={loading || busy || importing || (!instruction.trim() && !mode && !splitEnabled && !ticketCount && !predictionBook.length)} type="submit">
          {loading ? 'Sending…' : busy ? 'Creating…' : wantsSplit ? `Split${effectiveSplit ? ` · ${effectiveSplit}` : ''}` : predictionBook.length ? 'Submit book' : 'Generate codes'} <span aria-hidden>↑</span>
        </button>
      </div>
    </div>
  </form>;
}

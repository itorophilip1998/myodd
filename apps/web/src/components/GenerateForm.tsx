'use client';
import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readChatRequest } from '@myodd/shared';
import { ProgressQuest } from './ProgressQuest';
import { api } from '@/lib/api';

const MODES = [
  { name: 'Investor Mode', risk: 'Low risk', detail: '1–10 odds', icon: '◈', tone: 'investor' },
  { name: 'Gambler Mode', risk: 'Medium risk', detail: 'Above 10–100 odds', icon: '♧', tone: 'gambler' },
  { name: 'Japa Mode', risk: 'High risk', detail: 'Above 100–500 odds', icon: '↗', tone: 'japa' },
  { name: 'Lagoslife Mode', risk: 'Super high risk', detail: 'Above 500 · no upper limit', icon: 'ϟ', tone: 'lagos' },
];
export function GenerateForm({ initialBookingCode = '', initialInstruction = '', sourceCode, initialMode = '', initialSplitInto, sourceRevision = 0, busy = false }: { initialBookingCode?: string; initialInstruction?: string; sourceCode?: string; initialMode?: string; initialSplitInto?: number; sourceRevision?: number; busy?: boolean }) {
  const router = useRouter();
  const promptId = useId();
  const bookingCode = sourceCode ?? initialBookingCode;
  const [preferSource, setPreferSource] = useState(false);
  useEffect(() => { if (sourceRevision) setPreferSource(true); }, [sourceRevision]);
  const [instruction, setInstruction] = useState(initialInstruction);
  const [mode, setMode] = useState(() => MODES.find(item => item.name.toLowerCase() === initialMode.replace(/gamler/i, 'Gambler').replace(/lagos[ -]*li(?:f|v)es?/i, 'Lagoslife').toLowerCase())?.name ?? '');
  const [operation, setOperation] = useState<'auto' | 'generate' | 'split'>(initialSplitInto ? 'split' : 'auto');
  const splitEnabled = operation === 'split';
  const [splitCount, setSplitCount] = useState(() => String(initialSplitInto ?? readChatRequest(initialInstruction).splitInto ?? 5));
  const parsedChat = readChatRequest(instruction);
  const effectiveSplit = splitEnabled ? Number(splitCount) : parsedChat.splitInto;
  const wantsSplit = splitEnabled || (operation === 'auto' && parsedChat.isSplit);
  const edited = useRef(false);
  const [ticketCount, setTicketCount] = useState('');
  const [gamesCount, setGamesCount] = useState('');
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
  async function submit(event: FormEvent) {
    event.preventDefault(); if (loading || busy || (!instruction.trim() && !mode && !splitEnabled && !ticketCount && !gamesCount)) return;
    setSubmittedAt(new Date().toISOString()); setLoading(true); setError(null);
    const typedCode = parsedChat.bookingCode;
    const effectiveCode = (preferSource ? bookingCode : typedCode ?? bookingCode).trim().toUpperCase();
    const settings = [effectiveCode ? `Source code: ${effectiveCode}.` : '', wantsSplit ? `Split this code into ${effectiveSplit} parts.` : '', scope === 'original_only' ? 'Only use the original matches. Do not add new matches.' : scope === 'upcoming' ? 'Use new upcoming matches only.' : '', strict ? 'Only use my requested markets.' : '', nearest ? 'Closest available odds are allowed if exact target odds cannot be reached.' : '', mode ? `Risk mode: ${mode}.` : ''].filter(Boolean).join(' ');
    const prompt = instruction.trim() || (wantsSplit ? `Split this code into ${effectiveSplit} parts.` : 'Create tickets using my selected settings.');
    if (wantsSplit && (!Number.isInteger(effectiveSplit) || effectiveSplit! < 1 || effectiveSplit! > 100)) {
      setError('Choose 1–100 parts, or type “split into 5 parts”.'); setLoading(false); return;
    }
    try {
      const result = await api.generate({ bookingCode: effectiveCode || undefined, ticketCount: !wantsSplit && ticketCount ? Number(ticketCount) : undefined, gamesPerTicket: gamesCount ? Number(gamesCount) : undefined, operation: wantsSplit ? 'split' : 'generate', splitInto: wantsSplit ? effectiveSplit : undefined, instruction: prompt + (settings ? `\nFinal request settings (take precedence): ${settings}` : '') });
      router.push(`/result/${result.publicId}?job=${result.jobId}`);
    } catch (err) { setError((err as Error).message); setLoading(false); }
  }
  function shortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }
  if (loading) return <ProgressQuest job={{ status: 'PENDING', stage: 'SUBMITTING', stageDetail: 'Waiting for the server to accept your request', createdAt: submittedAt, progress: 0, total: 0, failedCount: 0 }} />;
  return <form onSubmit={submit} className="chat-composer">
    <fieldset className="mode-picker"><legend>Pick your mode <span>or describe your own</span></legend><div className="mode-grid">{MODES.map(item => <button type="button" key={item.name} aria-pressed={mode === item.name} onClick={() => { edited.current = true; setMode(mode === item.name ? '' : item.name); }} className={`mode-option ${item.tone} ${mode === item.name ? 'selected' : ''}`}><span className="mode-icon" aria-hidden>{item.icon}</span><span><strong>{item.name}</strong><span className="mode-risk">{item.risk}</span><small>{item.detail}</small></span><span className="mode-check" aria-hidden>{mode === item.name ? '✓' : ''}</span></button>)}</div></fieldset>
    <div className="composer chat-input-box">
      <label htmlFor={promptId} className="sr-only">Message myOdd</label>
      <textarea id={promptId} value={instruction} onChange={e => { edited.current = true; setInstruction(e.target.value); setOperation('auto'); setPreferSource(false); }} onKeyDown={shortcut} maxLength={4000} rows={2} placeholder="Paste a code and tell me what to do: ‘Split ME9915 into 5 parts using Investor Mode’…" />
      {!preferSource && parsedChat.bookingCode && parsedChat.bookingCode !== bookingCode && <p className="parsed-code-hint">Using {parsedChat.bookingCode} from your message</p>}
      <div className="chat-input-footer"><details className="composer-options"><summary>Options <span>Customize tickets</span></summary><div className="composer-settings">
        <div className="settings-heading"><strong>Make it your own</strong><span>Or leave these to your prompt</span></div>
        <div className="options-grid">
          <label>Action<select aria-label="Code operation" value={wantsSplit ? 'split' : 'generate'} onChange={e => { edited.current = true; setOperation(e.target.value as 'generate' | 'split'); }}><option value="generate">Generate variations</option><option value="split">Split a code</option></select></label>
          {wantsSplit ? <label>Total parts<input type="number" aria-label="Number of parts" min={1} max={100} step={1} value={splitEnabled ? splitCount : parsedChat.splitInto ?? ''} onChange={e => { edited.current = true; setOperation('split'); setSplitCount(e.target.value); }} /></label> : <label>Total tickets<input type="number" aria-label="Number of tickets" min={1} max={100} value={ticketCount} placeholder="From prompt" onChange={e => { edited.current = true; setTicketCount(e.target.value); }} /></label>}
          <label>Games per ticket<input type="number" aria-label="Games per ticket" min={1} max={30} value={gamesCount} placeholder={wantsSplit ? 'Balanced' : 'From prompt'} onChange={e => { edited.current = true; setGamesCount(e.target.value); }} /></label>
          <label className="settings-matches">Matches<select value={scope} onChange={e => setScope(e.target.value)}><option value="prompt">Follow my prompt</option><option value="original_only">Original matches only</option><option value="upcoming">New upcoming matches</option></select></label>
        </div>
        <div className="settings-toggles"><label className="check-option"><input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} />Only requested markets</label><label className="check-option"><input type="checkbox" checked={nearest} onChange={e => setNearest(e.target.checked)} />Allow nearest odds</label></div>
        {defaultsLoaded && <p className="settings-defaults">✧ Your saved defaults are applied</p>}
      </div></details><button className="primary-button" disabled={loading || busy || (!instruction.trim() && !mode && !splitEnabled && !ticketCount && !gamesCount)} type="submit">{loading ? 'Sending…' : busy ? 'Creating codes…' : wantsSplit ? `Split${effectiveSplit ? ` into ${effectiveSplit}` : ' code'}` : 'Generate codes'} <span aria-hidden>↑</span></button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </form>;
}

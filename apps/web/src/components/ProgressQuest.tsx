'use client';
import { useEffect, useState } from 'react';
import { LogoLoader } from './LogoLoader';
import type { JobProgress } from '@/lib/api';
const STEPS = [
  { title: 'Read request', icon: '✎' }, { title: 'Find games', icon: '⌕' },
  { title: 'Build tickets', icon: '◇' }, { title: 'Verify picks', icon: '✓' }, { title: 'Save codes', icon: '▣' },
];
const STAGES: Record<string, number> = { QUEUED: 0, READING: 0, PLANNING: 1, BUILDING: 2, CHECKING: 3, BOOKING: 4, SAVED: 5 };
const TITLES: Record<string, string> = { SUBMITTING: 'Sending your request', QUEUED: 'Your request is in the queue', READING: 'Finding available games', PLANNING: 'Understanding your picks', BUILDING: 'Finding matching combinations', CHECKING: 'Checking every pick', BOOKING: 'Creating your codes' };
const DETAILS: Record<string, string> = { SUBMITTING: 'Waiting for the server to accept your request', QUEUED: 'Your request is queued.', READING: 'Checking the source code and available games.', PLANNING: 'Matching your requested markets, periods and limits.', BUILDING: 'Searching live selections for matching combinations.', CHECKING: 'Verifying each pick against bookmaker availability.', BOOKING: 'Creating codes and saving confirmed tickets.' };
type BuildJob = Pick<JobProgress, 'status' | 'stage' | 'stageDetail' | 'createdAt' | 'updatedAt' | 'progress' | 'total' | 'failedCount'>;
export function ProgressQuest({ job, availability }: { job: BuildJob | null; availability?: { saved: number; checking: number; unavailable: number } }) {
  const [now, setNow] = useState<number | null>(null);
  const running = !!job && !['COMPLETED', 'FAILED'].includes(job.status);
  useEffect(() => { setNow(Date.now()); if (!running) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [running, job?.createdAt]);
  if (!job || !running) return null;
  const stage = job.stage ?? 'QUEUED';
  const step = STAGES[stage] ?? 0;
  const width = Math.min(99, step * 20 + (stage === 'BOOKING' && job.total ? job.progress / job.total * 20 : 0));
  const saved = Math.max(0, job.progress - (job.failedCount ?? 0));
  const elapsed = now && job.createdAt ? Math.max(0, Math.floor(((running ? now : new Date(job.updatedAt ?? job.createdAt).getTime()) - new Date(job.createdAt).getTime()) / 1000)) : 0;
  const duration = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  const detail = job.stageDetail ?? DETAILS[stage] ?? 'Working on your request.';
  const progressLabel = stage === 'BOOKING' && job.total ? `${job.progress} / ${job.total} processed` : `Step ${Math.min(step + 1, 5)} of 5`;
  return <section className="progress-quest quest-running" aria-label="Ticket creation progress" aria-busy={running}>
    <div className="quest-header"><div className="quest-emblem" aria-hidden>◇</div><div><p className="eyebrow">LIVE BUILD</p><h2>{TITLES[stage] ?? 'Working on your request'}</h2></div><span className="quest-counter">{job.createdAt && <time aria-label="Time elapsed">{duration}</time>}{running && <span className="live-dot" aria-label="Generation in progress" />}</span></div>
    <LogoLoader step={step + 1} label={stage === 'BOOKING' ? `${saved} codes saved · building your collection` : 'Your next codes are taking shape'} /><ol className="quest-steps">{STEPS.map((item, i) => <li key={item.title} aria-current={i === step && running ? 'step' : undefined} className={i < step ? 'step-done' : i === step ? 'step-current' : ''}><span aria-hidden>{i < step ? '✓' : item.icon}</span><small>{item.title}</small></li>)}</ol>
    <div className="quest-track" role="progressbar" aria-label="Build stages" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step} aria-valuetext={progressLabel}><div style={{ width: `${width}%` }} /></div>
    <div className="quest-bottom"><p role="status" aria-live="polite">{detail}</p><span>{progressLabel}</span></div>
    {job.total > 0 && <div className="quest-live-counts"><span><b>{saved}</b> saved</span><span><b>{Math.max(0, job.total - job.progress)}</b> remaining</span>{!!job.failedCount && <span><b>{job.failedCount}</b> unavailable</span>}{running && <small>Verified codes appear below as they are saved.</small>}</div>}
    {running && elapsed >= 45 && <p className="quest-patience">Still working with the live markets. Keep this page open, or save the collection when codes appear if you want them in your library.</p>}
  </section>;
}

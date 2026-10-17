'use client';
import { useEffect, useRef, useState } from 'react';
import { SlipGroup } from '@/lib/api';
import { GenerateForm } from './GenerateForm';
import { SlipGroups } from './SlipGroups';
import { SaveCollection } from './SaveCollection';
import { CollectionMenu } from './CollectionMenu';
import { ProgressQuest } from './ProgressQuest';
import { LearningFeedback } from './LearningFeedback';
import { RequestNotice } from './RequestNotice';
export function CodeWorkspace({ group, busy = false }: { group: SlipGroup; busy?: boolean }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!busy && new URLSearchParams(window.location.search).get('edit') === '1') setEditing(true); }, [busy]);
  useEffect(() => { if (busy) setEditing(false); }, [busy]);
  const [sourceCode, setSourceCode] = useState(group.originalBookingCode ?? '');
  const [sourceRevision, setSourceRevision] = useState(0);
  const initialMode = [...(group.description ?? '').matchAll(/Investor Mode|Gambler Mode|Gamler Mode|Japa Mode|Lagos[ -]*li(?:f|v)es? Mode/gi)].at(-1)?.[0] ?? '';
  const composer = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editing && !busy) { composer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); composer.current?.querySelector('textarea')?.focus({ preventScroll: true }); } }, [editing, busy]);
  function edit(code: string) { if (busy) return; setEditing(true); setSourceCode(code); setSourceRevision(n => n + 1); composer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); composer.current?.querySelector('textarea')?.focus({ preventScroll: true }); }
  const hasResults = group.slips.length > 0 || (group.availability?.saved ?? 0) > 0;
  const building = !!group.job && ['PENDING', 'RUNNING'].includes(group.job.status);
  return <>{!hasResults && building && <ProgressQuest job={group.job} availability={group.availability} />}{hasResults && building && <p className="collection-building-status" role="status"><span className="live-dot" aria-hidden />Your codes are ready below. {Math.max(0, group.job!.total - group.job!.progress)} tickets still processing.</p>}<div className="request-receipt"><p>{group.description?.split('\nFinal request settings')[0] || 'Your code collection'}</p><button type="button" className="icon-edit" aria-label={editing ? 'Close editor' : 'Edit request'} aria-expanded={editing && !busy} disabled={busy} title={busy ? 'Your request is being generated' : 'Edit your request'} onClick={() => setEditing(!editing)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" /></svg></button></div><div className="chat-workspace" ref={composer} hidden={!editing || busy} style={{ display: !editing || busy ? 'none' : undefined }}><div className="assistant-message"><span className="assistant-avatar" aria-hidden>m↗</span><div><strong>myOdd</strong><p>What would you like to change? Paste a code to split into parts, pick a mode, or tell me what to generate next.</p></div></div><GenerateForm initialMode={initialMode} sourceRevision={sourceRevision} initialSplitInto={group.generationReport?.splitDetails?.requestedParts} initialInstruction={group.description?.split('\nFinal request settings')[0] ?? ''} sourceCode={sourceCode} busy={busy} /></div>{group.availability && (group.availability.checking > 0 || group.availability.unavailable > 0) && <div className="availability-note" role="status">{group.availability.checking > 0 && <p>⌕ Rechecking {group.availability.checking} tickets with SportyBet… your generated codes stay listed below.</p>}{group.availability.unavailable > 0 && <p>{group.availability.unavailable} tickets may be unavailable at the bookmaker right now. They remain on this page with a status badge.</p>}</div>}<div className="collection-owner-actions">{group.creator && <span>{group.creator.name}</span>}{group.isOwner && <CollectionMenu collection={group} />}</div><SaveCollection publicId={group.publicId} saved={group.saved} userSaved={group.userSaved} isOwner={group.isOwner} isPublic={group.isPublic} /><RequestNotice notices={group.generationReport?.notices} />{group.slips.length > 0 && <SlipGroups slips={group.slips} groupPublicId={group.publicId} onEdit={busy ? undefined : edit} splitDetails={group.generationReport?.splitDetails} />}{group.job?.status === 'COMPLETED' && group.slips.length > 0 && <LearningFeedback publicId={group.publicId} />}</>;
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { SlipGroup } from '@/lib/api';
import { GenerateForm } from './GenerateForm';
import { SlipGroups } from './SlipGroups';
import { SaveCollection } from './SaveCollection';
import { CollectionMenu } from './CollectionMenu';
import { ProgressQuest } from './ProgressQuest';
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
  if (!hasResults && building) return <ProgressQuest job={group.job} availability={group.availability} />;
  return <>
    <div className="result-toolbar">
      <button type="button" className="outline-button" aria-expanded={editing && !busy} disabled={busy} onClick={() => setEditing(!editing)}>{editing ? 'Close editor' : 'New request'}</button>
      {group.isOwner && <CollectionMenu collection={group} />}
      <SaveCollection publicId={group.publicId} saved={group.saved} userSaved={group.userSaved} isOwner={group.isOwner} isPublic={group.isPublic} />
    </div>
    <div className="chat-workspace" ref={composer} hidden={!editing || busy} style={{ display: !editing || busy ? 'none' : undefined }}>
      <GenerateForm initialMode={initialMode} sourceRevision={sourceRevision} initialSplitInto={group.generationReport?.splitDetails?.requestedParts} initialInstruction={group.description?.split('\nFinal request settings')[0] ?? ''} sourceCode={sourceCode} busy={busy} />
    </div>
    {group.slips.length > 0 && <SlipGroups slips={group.slips} groupPublicId={group.publicId} onEdit={busy ? undefined : edit} splitDetails={group.generationReport?.splitDetails} />}
  </>;
}

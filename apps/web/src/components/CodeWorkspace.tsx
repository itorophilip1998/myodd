'use client';
import { useEffect, useRef, useState } from 'react';
import { generationOutcome } from '@myodd/shared';
import { SlipGroup } from '@/lib/api';
import { GenerateForm } from './GenerateForm';
import { SlipGroups } from './SlipGroups';
import { GenerationOutcome } from './GenerationOutcome';
import { SaveCollection } from './SaveCollection';
import { ProgressQuest } from './ProgressQuest';
import { useToast } from './ToastProvider';
import { BackButton } from './BackButton';

export function CodeWorkspace({ group, busy = false, promptToSave = false }: { group: SlipGroup; busy?: boolean; promptToSave?: boolean }) {
  const toast = useToast();
  const buildingToast = useRef(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (busy) setEditing(false); }, [busy]);
  const [sourceCode, setSourceCode] = useState(group.originalBookingCode ?? '');
  const [sourceRevision, setSourceRevision] = useState(0);
  const initialMode = [...(group.description ?? '').matchAll(/Investor Mode|Gambler Mode|Gamler Mode|Japa Mode|Lagos[ -]*li(?:f|v)es? Mode/gi)].at(-1)?.[0] ?? '';
  const composer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing && !busy) {
      composer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      composer.current?.querySelector('textarea')?.focus({ preventScroll: true });
    }
  }, [editing, busy]);
  function edit(code: string) {
    if (busy) return;
    setEditing(true);
    setSourceCode(code);
    setSourceRevision(n => n + 1);
    composer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    composer.current?.querySelector('textarea')?.focus({ preventScroll: true });
  }
  const hasResults = group.slips.length > 0;
  const building = !!group.job && ['PENDING', 'RUNNING'].includes(group.job.status);
  const showWorkspace = hasResults || (!building && !!group.job);
  useEffect(() => {
    if (!(hasResults && building) || buildingToast.current) return;
    buildingToast.current = true;
    const remaining = Math.max(0, (group.job?.total ?? 0) - (group.job?.progress ?? 0));
    toast(remaining > 0 ? `Codes ready below · ${remaining} still processing` : 'Codes ready below');
  }, [hasResults, building, group.job?.total, group.job?.progress, toast]);

  return <>

    {!building && <GenerationOutcome outcome={group.job?.outcome ?? (group.job ? generationOutcome({ id: group.publicId, ...group.job }) : undefined)} />}
    {building && <ProgressQuest job={group.job} />}
    {showWorkspace && (
      <div className="result-toolbar">
        <BackButton
          href={group.saved || group.userSaved ? '/history' : '/'}
          label={group.saved || group.userSaved ? 'Codes' : 'Create'}
        />
        <div className="result-toolbar-spacer" />
        {hasResults && (
          <SaveCollection
            publicId={group.publicId}
            title={group.title}
            saved={group.saved}
            userSaved={group.userSaved}
            isOwner={group.isOwner}
            isPublic={group.isPublic}
            autoPrompt={promptToSave && !busy && !building}
          />
        )}
      </div>
    )}
    {showWorkspace && (
      <div className="chat-workspace" ref={composer} hidden={!editing || busy} style={{ display: !editing || busy ? 'none' : undefined }}>
        <GenerateForm
          initialMode={initialMode}
          sourceRevision={sourceRevision}
          initialSplitInto={group.generationReport?.splitDetails?.requestedParts}
          initialInstruction={group.description?.split('\nFinal request settings')[0] ?? ''}
          sourceCode={sourceCode}
          busy={busy}
        />
      </div>
    )}
    {hasResults && (
      <SlipGroups
        slips={group.slips}
        groupPublicId={group.publicId}
        onEdit={busy ? undefined : edit}
        collection={{
          publicId: group.publicId,
          title: group.title,
          isPublic: group.isPublic,
          isOwner: group.isOwner,
          creator: group.creator ?? null,
        }}
        splitDetails={group.generationReport?.splitDetails}
        playSummary={group.playSummary}
        createdAt={group.createdAt}
        riskMode={group.riskMode ?? group.generationReport?.effectiveConfig?.riskMode}
        allowPlayCheck={!!(group.saved || group.userSaved || group.isOwner)}
      />
    )}
  </>;
}

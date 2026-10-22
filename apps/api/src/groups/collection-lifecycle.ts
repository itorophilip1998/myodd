type FinalLeg = { result: string; matchPhase: string; resultEvidence: unknown; resultCheckedAt: Date | null; matchCheckedAt: Date | null };
type GroupState = { jobs: { status: string }[]; slips: { selections: FinalLeg[] }[] };

export function collectionComplete(group: GroupState, freshSince?: Date): boolean {
  return group.slips.length > 0 && group.jobs.every(job => job.status === 'COMPLETED' || job.status === 'FAILED')
    && group.slips.every(slip => slip.selections.length > 0 && slip.selections.every(leg =>
      ['WON', 'LOST', 'VOID'].includes(leg.result) && leg.matchPhase === 'finished'
      && leg.resultEvidence != null && leg.resultCheckedAt != null && leg.matchCheckedAt != null
      && (!freshSince || leg.matchCheckedAt >= freshSince && leg.resultCheckedAt >= freshSince)));
}

export function completionDates(complete: boolean, completedAt: Date | null, now: Date) {
  if (!complete) return { completedAt: null, deleteAfter: null };
  const completed = completedAt ?? now;
  return { completedAt: completed, deleteAfter: new Date(completed.getTime() + 86400_000) };
}

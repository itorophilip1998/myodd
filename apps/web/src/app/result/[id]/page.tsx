'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LogoLoader } from '@/components/LogoLoader';
import { ProgressQuest } from '@/components/ProgressQuest';
import { CodeWorkspace } from '@/components/CodeWorkspace';
import { OriginalSlip } from '@/components/OriginalSlip';
import { Suspense, useEffect } from 'react';
import { GenerationSummary } from '@/components/GenerationSummary';

function ResultInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const jobId = search.get('job');
  const publicId = params.id;

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 1500;
    },
  });

  const groupQuery = useQuery({
    queryKey: ['group', publicId],
    queryFn: () => api.getGroup(publicId),
    refetchInterval: (query) => {
      if (query.state.data?.availability?.checking) return 1500;
      const status = jobQuery.data?.status ?? query.state.data?.job?.status;
      return status === 'PENDING' || status === 'RUNNING' ? 1500 : 30000;
    },
  });

  useEffect(() => {
    if (jobQuery.data?.status === 'COMPLETED' || jobQuery.data?.status === 'FAILED') {
      void groupQuery.refetch();
    }
  }, [jobQuery.data?.status, groupQuery.refetch]);

  const group = groupQuery.error ? undefined : groupQuery.data;
  const originalQuery = useQuery({
    queryKey: ['analyze', group?.originalBookingCode],
    queryFn: () => api.analyze(group!.originalBookingCode!),
    enabled: !!group?.originalBookingCode,
    retry: false,
  });

  const job = jobQuery.data ?? group?.job;
  const loading =
    job && job.status !== 'COMPLETED' && job.status !== 'FAILED';

  return (
    <main className="workspace space-y-8">
      <header className="space-y-2 animate-rise">
        <h1 className="font-display text-3xl">
          {group?.title ?? 'Generating slips…'}
        </h1>
        {job?.error && (
          <p className="text-ember" role="alert">
            {job.error ?? 'Generation failed. Markets may have changed — try again.'}
          </p>
        )}
      </header>

      {(jobQuery.error || groupQuery.error) && (
        <p className="text-ember" role="alert">
          {(jobQuery.error ?? groupQuery.error)?.message}
        </p>
      )}

      {!group && !groupQuery.error && !jobQuery.error && <ProgressQuest job={job ?? { status: 'PENDING', stage: 'QUEUED', progress: 0, total: 0, failedCount: 0 }} />}
      {group && <CodeWorkspace key={group.publicId} group={{ ...group, job: job ?? group.job }} busy={!!loading} />}
      {group && <details className="request-details"><summary>Request details</summary>{group.generationReport && <GenerationSummary report={group.generationReport} />}{originalQuery.data && <OriginalSlip booking={originalQuery.data} />}</details>}

      {!loading && group && group.slips.length === 0 && !group.availability?.saved && job?.status === 'COMPLETED' && (
        <p className="text-sand/70">
          No slips were created. Try a wider odds range or different markets.
        </p>
      )}
    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<main className="workspace"><LogoLoader label="Opening your tickets" /></main>}>
      <ResultInner />
    </Suspense>
  );
}

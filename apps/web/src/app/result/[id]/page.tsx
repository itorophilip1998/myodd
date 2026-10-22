'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LogoLoader } from '@/components/LogoLoader';
import { ProgressQuest } from '@/components/ProgressQuest';
import { CodeWorkspace } from '@/components/CodeWorkspace';
import { Suspense, useEffect } from 'react';

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
      return q.state.error ? false : 1500;
    },
  });

  const groupQuery = useQuery({
    queryKey: ['group', publicId],
    queryFn: () => api.getGroup(publicId),
    refetchInterval: (query) => {
      if (query.state.data?.availability?.checking) return 1500;
      const status = jobQuery.data?.status ?? query.state.data?.job?.status;
      return status === 'PENDING' || status === 'RUNNING' ? 1500 : false;
    },
  });

  useEffect(() => {
    if (jobQuery.data?.status === 'COMPLETED' || jobQuery.data?.status === 'FAILED') {
      void groupQuery.refetch();
    }
  }, [jobQuery.data?.status, groupQuery.refetch]);

  const group = groupQuery.data;
  const job = jobQuery.data ?? group?.job;
  const loading = job && job.status !== 'COMPLETED' && job.status !== 'FAILED';

  return (
    <main className="workspace result-workspace">
      {(groupQuery.error || jobQuery.error) && <section role="alert" className="generation-outcome"><h1>Results could not refresh</h1><p>Results are temporarily unavailable. Please retry.</p><p>Any codes already loaded remain below.</p><button type="button" className="outline-button" onClick={() => { void groupQuery.refetch(); if (jobId) void jobQuery.refetch(); }}>Try again</button><a href="/">Adjust your request</a></section>}
      {!group && !groupQuery.error && !jobQuery.error && (
        <ProgressQuest job={job ?? { status: 'PENDING', stage: 'QUEUED', progress: 0, total: 0, failedCount: 0 }} />
      )}
      {group && <CodeWorkspace key={group.publicId} group={{ ...group, job: job ?? group.job }} busy={!!loading} promptToSave={!!jobId} />}


    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<main className="workspace"><LogoLoader label="Loading results" /></main>}>
      <ResultInner />
    </Suspense>
  );
}

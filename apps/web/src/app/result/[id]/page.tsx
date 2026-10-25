'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SlipGroup } from '@/lib/api';
import { LogoLoader } from '@/components/LogoLoader';
import { ProgressQuest } from '@/components/ProgressQuest';
import { CodeWorkspace } from '@/components/CodeWorkspace';
import { freshestResultJob, permanentResultError, resultReadInterval, retryResultRead } from '@/lib/result-recovery';
import { Suspense, useEffect } from 'react';

function ResultInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const jobId = search.get('job');
  const publicId = params.id;
  const client = useQueryClient();
  const jobQuery = useQuery({
    queryKey: ['job', jobId], queryFn: () => api.getJob(jobId!), enabled: !!jobId,
    staleTime: 0, retry: retryResultRead, retryDelay: attempt => Math.min(4000, 1000 * 2 ** attempt),
    refetchInterval: query => {
      const embedded = client.getQueryData<SlipGroup>(['group', publicId])?.job;
      if (['COMPLETED', 'FAILED'].includes(embedded?.status ?? query.state.data?.status ?? '')) return false;
      return resultReadInterval(query.state.error, query.state.fetchFailureCount);
    },
  });
  const groupQuery = useQuery({
    queryKey: ['group', publicId], queryFn: () => api.getGroup(publicId),
    staleTime: 0, retry: retryResultRead, retryDelay: attempt => Math.min(4000, 1000 * 2 ** attempt),
    refetchInterval: query => {
      if (query.state.error) return resultReadInterval(query.state.error, query.state.fetchFailureCount);
      const group = query.state.data;
      const job = freshestResultJob(jobQuery.data, group?.job);
      if (!group || group.availability?.checking) return 1500;
      if (!job) return false;
      if (['PENDING', 'RUNNING'].includes(job.status)) return 1500;
      // A terminal job may arrive before a previously in-flight collection read finishes.
      return (job.outcome?.generated ?? 0) > group.slips.length ? 1500 : false;
    },
  });
  useEffect(() => {
    if (['COMPLETED', 'FAILED'].includes(jobQuery.data?.status ?? '')) void groupQuery.refetch();
  }, [jobQuery.data?.status, groupQuery.refetch]);
  const group = groupQuery.data;
  const job = freshestResultJob(jobQuery.data, group?.job);
  const loading = !!job && ['PENDING', 'RUNNING'].includes(job.status);
  const reconnecting = !!groupQuery.error || (!group && !!jobQuery.error);
  const awaitingTickets = !!group && (job?.outcome?.generated ?? 0) > group.slips.length;
  function reconnect() { void groupQuery.refetch(); if (jobId) void jobQuery.refetch(); }

  if (permanentResultError(groupQuery.error)) return <main className="workspace result-workspace"><section className="generation-outcome" role="alert"><h1>Open your generation</h1><p>Check your result link or sign in to the account that created it.</p><Link className="outline-button" href={`/sign-in?redirect_url=${encodeURIComponent(`/result/${publicId}${jobId ? `?job=${jobId}` : ''}`)}`}>Sign in</Link><Link className="text-link" href="/">Back to Create</Link></section></main>;
  return <main className="workspace result-workspace">
    {reconnecting && <section role="status" className="result-connection"><p>{group?.slips.length ? 'Reconnecting to updates. Your saved codes are below.' : 'Reconnecting to your generation. We’ll resume automatically.'}</p><button type="button" className="outline-button" disabled={groupQuery.isFetching} onClick={reconnect}>Reconnect now</button></section>}
    {!group && (reconnecting ? <LogoLoader label="Reconnecting to your generation" /> : <ProgressQuest job={job ?? { status: 'PENDING', stage: 'QUEUED', progress: 0, total: 0, failedCount: 0 }} />)}
    {awaitingTickets && !loading && !group?.slips.length && <LogoLoader compact label="Loading your saved codes" />}
    {group && <CodeWorkspace key={group.publicId} group={{ ...group, job: job ?? group.job }} busy={loading || awaitingTickets} promptToSave={!!jobId} />}
  </main>;
}
export default function ResultPage() {
  return <Suspense fallback={<main className="workspace"><LogoLoader label="Loading results" /></main>}><ResultInner /></Suspense>;
}

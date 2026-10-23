'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CodeWorkspace } from '@/components/CodeWorkspace';
import { LogoLoader } from '@/components/LogoLoader';
import { permanentResultError, resultReadInterval, retryResultRead } from '@/lib/result-recovery';

export default function GroupPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['group', params.id],
    queryFn: () => api.getGroup(params.id),
    retry: retryResultRead, retryDelay: attempt => Math.min(4000, 1000 * 2 ** attempt),
    refetchInterval: query => query.state.error ? resultReadInterval(query.state.error, query.state.fetchFailureCount) : ['PENDING', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : query.state.data?.availability?.checking ? 1500 : false,
  });

  if (isLoading && !data) {
    return <main className="workspace"><LogoLoader label="Loading results" /></main>;
  }
  if (!data && isError && !permanentResultError(error)) return <main className="workspace"><LogoLoader label="Reconnecting to your collection" /><button type="button" className="outline-button" disabled={isFetching} onClick={() => void refetch()}>Reconnect now</button></main>;
  if (permanentResultError(error) || !data) {
    return <main className="workspace"><p className="empty-state">Collection not found.</p></main>;
  }

  return (
    <main className="workspace result-workspace">
      {isError && <section role="status" className="result-connection"><p>Reconnecting to collection updates. Your codes are below.</p><button type="button" className="outline-button" disabled={isFetching} onClick={() => void refetch()}>Reconnect now</button></section>}
      <CodeWorkspace key={data.publicId} group={data} busy={!!data.job && ['PENDING', 'RUNNING'].includes(data.job.status)} />
    </main>
  );
}

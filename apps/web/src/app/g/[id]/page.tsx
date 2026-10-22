'use client';

import { useParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CodeWorkspace } from '@/components/CodeWorkspace';
import { LogoLoader } from '@/components/LogoLoader';

export default function GroupPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['group', params.id],
    queryFn: () => api.getGroup(params.id),
    refetchInterval: query => ['PENDING', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : query.state.data?.availability?.checking ? 1500 : false,
    placeholderData: keepPreviousData,
  });

  if (isLoading && !data) {
    return <main className="workspace"><LogoLoader label="Loading results" /></main>;
  }
  if ((isError && !data) || !data) {
    return <main className="workspace"><p className="empty-state">Collection not found.</p></main>;
  }

  return (
    <main className="workspace result-workspace">
      {isError && <section role="alert" className="generation-outcome"><p>Collection results could not refresh. Any loaded tickets remain below.</p><button type="button" className="outline-button" onClick={() => void refetch()}>Retry results</button></section>}
      <CodeWorkspace key={data.publicId} group={data} busy={!!data.job && ['PENDING', 'RUNNING'].includes(data.job.status)} />
    </main>
  );
}

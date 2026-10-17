'use client';

import { useParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CodeWorkspace } from '@/components/CodeWorkspace';
import { LogoLoader } from '@/components/LogoLoader';

export default function GroupPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['group', params.id],
    queryFn: () => api.getGroup(params.id),
    refetchInterval: query => ['PENDING', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : query.state.data?.availability?.checking ? 1500 : false,
    placeholderData: keepPreviousData,
  });

  if (isLoading && !data) {
    return <main className="workspace"><LogoLoader label="Loading results" /></main>;
  }
  if ((isError && !data) || !data) {
    return (
      <main className="workspace">
        <p className="form-error" role="alert">{(error as Error)?.message ?? 'Collection not found'}</p>
      </main>
    );
  }

  return <main className="workspace result-workspace">
    {data.job?.error && <p role="alert" className="form-error">{data.job.error}</p>}
    <CodeWorkspace key={data.publicId} group={data} busy={!!data.job && ['PENDING', 'RUNNING'].includes(data.job.status)} />
  </main>;
}

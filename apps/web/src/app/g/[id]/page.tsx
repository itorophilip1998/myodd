'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CodeWorkspace } from '@/components/CodeWorkspace';
import { LogoLoader } from '@/components/LogoLoader';
import { GenerationSummary } from '@/components/GenerationSummary';

export default function GroupPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['group', params.id],
    queryFn: () => api.getGroup(params.id),
    refetchInterval: query => ['PENDING', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : query.state.data?.availability?.checking ? 1500 : 30000,
  });

  if (isLoading) {
    return <main className="workspace"><LogoLoader label="Opening your collection" /></main>;
  }
  if (error || !data) {
    return (
      <main className="p-12 text-center text-ember">
        {(error as Error)?.message ?? 'Group not found'}
      </main>
    );
  }

  return <main className="workspace space-y-8">
    <header className="collection-title"><p className="eyebrow">SAVED COLLECTION</p><h1>{data.title}</h1></header>
    {data.job?.error && <p role="alert" className="form-error">{data.job.error}</p>}
    <CodeWorkspace key={data.publicId} group={data} busy={!!data.job && ['PENDING', 'RUNNING'].includes(data.job.status)} />
    <details className="request-details"><summary>Request details</summary><p>{data.description}</p>{data.generationReport && <GenerationSummary report={data.generationReport} />}</details>
  </main>;
}

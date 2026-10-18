'use client';

import { useParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { CodeWorkspace } from '@/components/CodeWorkspace';
import { LogoLoader } from '@/components/LogoLoader';
import { useToast } from '@/components/ToastProvider';

export default function GroupPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const told = useRef<string | null>(null);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['group', params.id],
    queryFn: () => api.getGroup(params.id),
    refetchInterval: query => ['PENDING', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : query.state.data?.availability?.checking ? 1500 : false,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const message = data?.job?.error
      || ((isError && !data) ? ((error as Error)?.message ?? 'Collection not found') : null);
    if (!message) return;
    const key = `${params.id}:${message}`;
    if (told.current === key) return;
    told.current = key;
    toast(message, { sticky: true });
  }, [data?.job?.error, isError, data, error, params.id, toast]);

  if (isLoading && !data) {
    return <main className="workspace"><LogoLoader label="Loading results" /></main>;
  }
  if ((isError && !data) || !data) {
    return <main className="workspace"><p className="empty-state">Collection not found.</p></main>;
  }

  return (
    <main className="workspace result-workspace">
      <CodeWorkspace key={data.publicId} group={data} busy={!!data.job && ['PENDING', 'RUNNING'].includes(data.job.status)} />
    </main>
  );
}

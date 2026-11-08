'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PublicCollectionCard } from './PublicCollectionCard';

export function PublicPreview() {
  const query = useQuery({ queryKey: ['public-collections', 1], queryFn: () => api.publicGroups(), staleTime: 300_000 });
  return <section aria-label="Public collections" className="public-preview">
    <h2>Public collections</h2>
    {query.isPending && <p role="status">Loading collections…</p>}
    {query.isError && <p role="alert">Collections could not load. <button onClick={() => void query.refetch()}>Try again</button></p>}
    {query.data?.length === 0 && <p>No public collections yet.</p>}
    <ul className="history-grid">{query.data?.slice(0, 6).map(collection => <PublicCollectionCard key={collection.publicId} collection={collection} />)}</ul>
  </section>;
}

'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SlipGroups } from '@/components/SlipGroups';
import Link from 'next/link';

export default function GroupPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['group', params.id],
    queryFn: () => api.getGroup(params.id),
  });

  if (isLoading) {
    return <main className="p-12 text-center text-sand/60">Loading…</main>;
  }
  if (error || !data) {
    return (
      <main className="p-12 text-center text-ember">
        {(error as Error)?.message ?? 'Group not found'}
      </main>
    );
  }

  return (
    <main className="px-6 py-12 max-w-3xl mx-auto space-y-8">
      <Link href="/" className="font-display text-2xl text-lime inline-block">
        myOdd
      </Link>
      <header className="space-y-2 animate-rise">
        <h1 className="font-display text-4xl">{data.title}</h1>
        <p className="text-sand/60">
          {data.slips.length} SportyBet codes · Lower variance{' '}
          {data.counts.lower} · Moderate {data.counts.moderate} · Higher
          variance {data.counts.higher}
        </p>
        <p className="text-sm text-sand/50">
          Probabilities from live odds — not guarantees. 18+ | Gamble
          responsibly.
        </p>
      </header>
      <SlipGroups slips={data.slips} groupPublicId={data.publicId} />
    </main>
  );
}

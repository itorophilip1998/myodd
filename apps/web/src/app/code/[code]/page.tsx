'use client';
import { formatOdds, exactOdds } from '@myodd/shared';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ShareButtons } from '@/components/ShareButtons';
import Link from 'next/link';

export default function CodePage() {
  const params = useParams<{ code: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['code', params.code],
    queryFn: () => api.getCode(params.code),
  });

  if (isLoading) {
    return <main className="p-12 text-center text-sand/60">Loading…</main>;
  }
  if (error || !data) {
    return (
      <main className="p-12 text-center text-ember">
        {(error as Error)?.message ?? 'Code not found'}
      </main>
    );
  }

  const groupUrl = data.groupPublicId
    ? typeof window !== 'undefined'
      ? `${window.location.origin}/g/${data.groupPublicId}`
      : `/g/${data.groupPublicId}`
    : undefined;

  return (
    <main className="px-6 py-12 max-w-2xl mx-auto space-y-8">
      <Link href={data.groupPublicId ? `/g/${data.groupPublicId}` : '/history'} className="text-sm text-lime">← Back to collection</Link>
      <header className="space-y-3 animate-rise">
        <p className="text-sm uppercase tracking-[0.25em] text-lime/70">
          SportyBet code
        </p>
        <h1 className="font-display text-5xl tracking-wide">{data.bookingCode}</h1>
        <p className="text-sand/70">
          Odds <span title={exactOdds(data.totalOdds)}>{formatOdds(data.totalOdds)}</span> · {data.selectionCount} selections
        </p>
        <ShareButtons
          code={data.bookingCode}
          selectionCount={data.selectionCount}
          totalOdds={data.totalOdds}
          shareUrl={data.shareUrl}
          groupUrl={groupUrl}
          expired={!!data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()}
        />
      </header>
      {data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now() && <p className="text-sand/60 text-sm">Archived code. Generate a fresh collection to use upcoming matches.</p>}
      <ul className="space-y-4 animate-rise-delay">
        {data.selections.map((s, i) => (
          <li key={i} className="border-b border-white/10 pb-3">
            <p className="text-sand/50 text-sm">{s.league}</p>
            <p className="font-medium">
              {s.homeTeam} vs {s.awayTeam}
            </p>
            <p className="text-lime/90">
              {s.marketName}: {s.selectionName} @ {formatOdds(s.odds)}
            </p>
            <p className="text-xs text-sand/50 mt-1">
              {s.kickoffAt
                ? ` · ${new Date(s.kickoffAt).toLocaleString()}`
                : ''}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}

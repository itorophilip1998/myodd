'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SlipGroups } from '@/components/SlipGroups';
import { OriginalSlip } from '@/components/OriginalSlip';
import Link from 'next/link';
import { Suspense } from 'react';

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
      return 1500;
    },
  });

  const groupQuery = useQuery({
    queryKey: ['group', publicId],
    queryFn: () => api.getGroup(publicId),
    refetchInterval: () => {
      const status = jobQuery.data?.status;
      if (!jobId || status === 'COMPLETED' || status === 'FAILED') return false;
      return 2000;
    },
  });

  const group = groupQuery.data;
  const originalQuery = useQuery({
    queryKey: ['analyze', group?.originalBookingCode],
    queryFn: () => api.analyze(group!.originalBookingCode!),
    enabled: !!group?.originalBookingCode,
    retry: false,
  });

  const job = jobQuery.data;
  const loading =
    job && job.status !== 'COMPLETED' && job.status !== 'FAILED';

  return (
    <main className="px-6 py-12 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="font-display text-2xl text-lime">
          myOdd
        </Link>
        {group && (
          <button
            type="button"
            className="text-sm border border-lime/40 text-lime px-3 py-1.5 hover:bg-lime/10"
            onClick={() => {
              const url = `${window.location.origin}/g/${group.publicId}`;
              void navigator.clipboard.writeText(url);
            }}
          >
            Share all
          </button>
        )}
      </div>

      <header className="space-y-2 animate-rise">
        <h1 className="font-display text-3xl">
          {group?.title ?? 'Generating slips…'}
        </h1>
        {group?.originalBookingCode && (
          <p className="text-sand/60">
            Original code{' '}
            <span className="text-sand">{group.originalBookingCode}</span>
          </p>
        )}
        {loading && (
          <p className="text-lime/80 animate-pulseSoft">
            Creating codes… {job?.progress ?? 0}/{job?.total || '…'}
          </p>
        )}
        {job?.status === 'FAILED' && (
          <p className="text-ember" role="alert">
            {job.error ?? 'Generation failed. Markets may have changed — try again.'}
          </p>
        )}
      </header>

      {originalQuery.data && <OriginalSlip booking={originalQuery.data} />}

      {group && group.slips.length > 0 && (
        <>
          <p className="text-sand/70 animate-rise-delay">
            {group.slips.length} slips · Lower {group.counts.lower} · Moderate{' '}
            {group.counts.moderate} · Higher {group.counts.higher}
          </p>
          <SlipGroups slips={group.slips} groupPublicId={group.publicId} />
        </>
      )}

      {!loading && group && group.slips.length === 0 && job?.status === 'COMPLETED' && (
        <p className="text-sand/70">
          No slips were created. Try a wider odds range or different markets.
        </p>
      )}
    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<main className="p-12 text-center">Loading…</main>}>
      <ResultInner />
    </Suspense>
  );
}

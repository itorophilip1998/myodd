import type { GeneratedSlip } from '@/lib/api';
import { ShareButtons } from './ShareButtons';
import Link from 'next/link';

const LABELS = {
  LOWER: 'Lower variance',
  MODERATE: 'Moderate',
  HIGHER: 'Higher variance',
} as const;

export function SlipGroups({
  slips,
  groupPublicId,
}: {
  slips: GeneratedSlip[];
  groupPublicId: string;
}) {
  const buckets = {
    LOWER: slips.filter((s) => s.riskLevel === 'LOWER'),
    MODERATE: slips.filter((s) => s.riskLevel === 'MODERATE'),
    HIGHER: slips.filter((s) => s.riskLevel === 'HIGHER'),
  };

  const groupUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/g/${groupPublicId}`
      : `/g/${groupPublicId}`;

  return (
    <div className="space-y-10">
      {(Object.keys(buckets) as Array<keyof typeof buckets>).map((key) => {
        const list = buckets[key];
        if (!list.length) return null;
        return (
          <section key={key} className="animate-rise">
            <h2 className="font-display text-2xl text-lime mb-4">
              {LABELS[key]}
            </h2>
            <ul className="space-y-4">
              {list.map((slip) => (
                <li
                  key={slip.id}
                  className="border-b border-white/10 pb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Link
                      href={`/code/${slip.bookingCode}`}
                      className="font-display text-xl tracking-wide hover:text-lime transition"
                    >
                      {slip.bookingCode}
                    </Link>
                    <p className="text-sand/70 text-sm mt-1">
                      Odds {slip.totalOdds.toFixed(2)} · {slip.selectionCount}{' '}
                      selections · Confidence {Math.round(slip.confidence)}%
                    </p>
                  </div>
                  <ShareButtons
                    code={slip.bookingCode}
                    selectionCount={slip.selectionCount}
                    totalOdds={slip.totalOdds}
                    shareUrl={slip.shareUrl}
                    groupUrl={groupUrl}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

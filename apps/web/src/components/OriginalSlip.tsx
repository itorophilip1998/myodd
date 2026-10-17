import { formatOdds, exactOdds } from '@myodd/shared';
import type { api } from '@/lib/api';

type Analyzed = Awaited<ReturnType<typeof api.analyze>>;

export function OriginalSlip({ booking }: { booking: Analyzed }) {
  return (
    <section className="space-y-4 animate-rise border-b border-white/10 pb-8">
      <h2 className="font-display text-2xl text-lime">Original slip</h2>
      <p className="text-sand/70">
        {booking.code} · {booking.selectionCount} selections · Odds{' '}
        <span title={booking.totalOdds == null ? undefined : exactOdds(booking.totalOdds)}>{booking.totalOdds == null ? 'unavailable' : formatOdds(booking.totalOdds)}</span>
      </p>
      <ul className="space-y-3">
        {booking.selections.map((s, i) => (
          <li key={i} className="text-sm">
            <p className="text-sand/50">{s.league}</p>
            <p>
              {s.homeTeam} vs {s.awayTeam}
            </p>
            <p className="text-lime/90">
              {s.marketName ?? 'Market unavailable'}: {s.selectionName ?? 'Selection unavailable'}
              {s.odds ? ` @ ${formatOdds(s.odds)}` : ''}
            </p>
            {s.kickoffAt && (
              <p className="text-sand/40 text-xs">
                {new Date(s.kickoffAt).toLocaleString()}
                {s.isActive === false ? ' · unavailable for pre-match generation' : ''}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

'use client';
import { confirmedFinalTicket } from '@/lib/cache-policy';
import { CopyCode } from '@/components/CopyCode';
import { ResultBadge, ResultDetails } from '@/components/ResultBadge';
import { resultStatus } from '@/lib/result-status';
import { formatOdds, exactOdds } from '@myodd/shared';

import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type LegPlayStatus } from '@/lib/api';
import { ShareButtons } from '@/components/ShareButtons';
import { formatLagosDateTime } from '@/lib/datetime';
import { modeTag } from '@/lib/mode-label';
import { useToast } from '@/components/ToastProvider';
import { BackLink } from '@/components/BackButton';

function isDoneLeg(status?: LegPlayStatus | null) {
  return status === 'PLAYED' || status === 'CUT';
}

export default function CodePage() {
  const params = useParams<{ code: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['code', params.code],
    queryFn: () => api.getCode(params.code),
    staleTime: query => confirmedFinalTicket(query.state.data) ? 3600_000 : 30_000,
    refetchInterval: query => confirmedFinalTicket(query.state.data) ? false : 60_000,
  });

  async function checkPlayed() {
    setChecking(true);
    try {
      const result = await api.checkPlayCode(params.code);
      await queryClient.invalidateQueries({ queryKey: ['code', params.code] });
      if (data?.groupPublicId) await queryClient.invalidateQueries({ queryKey: ['group', data.groupPublicId] });
      const bits = [
        resultStatus(result),
        result.liveLegs ? `${result.liveLegs} live` : '',
        result.playedLegs ? `${result.playedLegs} done` : '',
      ].filter(Boolean);
      toast(`${params.code}: ${bits.join(' · ')}`, { sticky: true });
    } catch (e) {
      toast((e as Error).message || 'Could not check this ticket.', { sticky: true });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!error) return;
    toast((error as Error)?.message ?? 'Code not found', { sticky: true });
  }, [error, toast]);

  if (isLoading) {
    return <main className="workspace code-detail-workspace"><p className="empty-state">Loading…</p></main>;
  }
  if (error || !data) {
    return (
      <main className="workspace code-detail-workspace">
        <p className="empty-state">Code not found.</p>
      </main>
    );
  }

  const groupUrl = data.groupPublicId
    ? typeof window !== 'undefined'
      ? `${window.location.origin}/g/${data.groupPublicId}`
      : `/g/${data.groupPublicId}`
    : undefined;
  const canVerify = !!(data.userSaved || data.isOwner);
  const modeLabel = modeTag(data.riskMode);
  const modeKey = (data.riskMode ?? '').toLowerCase();
  const expired = !!data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now();

  return (
    <main className="workspace code-detail-workspace">
      <BackLink
        href={data.groupPublicId ? `/g/${data.groupPublicId}` : '/history'}
        label={data.groupPublicId ? 'Collection' : 'Codes'}
      />
      <header className="code-detail-head">
        <p className="eyebrow">SportyBet code</p>
        <h1 className="code-detail-title"><CopyCode code={data.bookingCode} className="code-detail-title" /></h1>
        <p className="code-detail-sub">
          Odds <span title={exactOdds(data.totalOdds)}>{formatOdds(data.totalOdds)}</span> · {data.selectionCount} selections
        </p>
        <div className="ticket-meta">
          <ResultBadge {...data} />
          {modeLabel && <span className={`mode-tag mode-${modeKey}`}>{modeLabel}</span>}
          {data.createdAt && <time dateTime={data.createdAt}>{formatLagosDateTime(data.createdAt)}</time>}
        </div>
        <ResultDetails {...data} checkedAt={data.playCheckedAt} />
        <div className="code-detail-actions">
          {canVerify && (
            <button type="button" className="outline-button" disabled={checking} onClick={() => void checkPlayed()}>
              {checking ? 'Checking…' : 'Check result'}
            </button>
          )}
          <ShareButtons
            code={data.bookingCode}
            selectionCount={data.selectionCount}
            totalOdds={data.totalOdds}
            shareUrl={data.shareUrl}
            groupUrl={groupUrl}
            expired={expired}
          />
        </div>
        {!canVerify && (
          <p className="code-detail-hint">Save this collection from Codes to check its results.</p>
        )}
        {expired && <p className="code-detail-hint">Archived code. Generate a fresh collection to use upcoming matches.</p>}
      </header>
      <p className="code-detail-hint">Tracks the saved selections without placing a bet. Completed matches may still be awaiting a confirmed result.</p>
      <ul className="code-leg-list">
        {data.selections.map((s, i) => (
          <li key={i} className={s.playStatus === 'LIVE' ? 'is-live-leg' : isDoneLeg(s.playStatus) ? 'is-played-leg' : undefined}>
            <div className="code-leg-top">
              <p className="code-leg-league">{s.league}</p>
              <ResultBadge {...s} checkedAt={s.resultCheckedAt} source={s.resultSource} />
            </div>
            <ResultDetails {...s} checkedAt={s.resultCheckedAt} source={s.resultSource} />
            <p className="code-leg-match">{s.homeTeam} vs {s.awayTeam}</p>
            <p className="code-leg-pick">
              {s.marketName}: {s.selectionName} @ {formatOdds(s.odds)}
            </p>
            {(s.score || s.playNote || s.kickoffAt) && (
              <p className="code-leg-note">
                {[s.score, s.playNote, s.kickoffAt ? formatLagosDateTime(s.kickoffAt) : ''].filter(Boolean).join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

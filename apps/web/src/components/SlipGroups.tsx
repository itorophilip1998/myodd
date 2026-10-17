'use client';
import { formatOdds, exactOdds } from '@myodd/shared';
import { useState } from 'react';
import type { GeneratedSlip, GenerationReport } from '@/lib/api';
import { api } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { VerifiedBookmakerLink } from './VerifiedBookmakerLink';
import { ShareButtons } from './ShareButtons';
import Link from 'next/link';

const STATUS_LABEL: Record<NonNullable<GeneratedSlip['displayStatus']>, string> = {
  ACTIVE: 'Active',
  CHECKING: 'Checking…',
  PARTIAL: 'Partial',
  UNAVAILABLE: 'Unavailable',
  EXPIRED: 'Expired',
  UNKNOWN: 'Stored',
};

export function SlipGroups({ slips, groupPublicId, onEdit, splitDetails }: { slips: GeneratedSlip[]; groupPublicId: string; onEdit?: (code: string) => void; splitDetails?: GenerationReport['splitDetails'] }) {
  const [checkingCopy, setCheckingCopy] = useState(false);
  const [status, setStatus] = useState('');
  const expired = (slip: GeneratedSlip) => slip.displayStatus === 'EXPIRED' || (!!slip.expiresAt && new Date(slip.expiresAt).getTime() <= Date.now());
  const actionable = (slip: GeneratedSlip) => !expired(slip) && (slip.displayStatus === 'ACTIVE' || slip.displayStatus === 'CHECKING' || !slip.displayStatus);
  async function copyAll() {
    setCheckingCopy(true);
    try {
      const checked = await api.verifyGroup(groupPublicId);
      const valid = checked.codes;
      if (!valid.length) { setStatus('No active codes right now.'); return; }
      await copyText(valid.join('\n'));
      setStatus(`Copied ${valid.length} codes${checked.unavailable ? ` · ${checked.unavailable} skipped` : ''}`);
    } catch { setStatus('Could not verify codes right now. Please try again.'); } finally { setCheckingCopy(false); }
  }
  async function shareAll() {
    const url = `${window.location.origin}/g/${groupPublicId}`;
    try {
      await api.publishGroup(groupPublicId);
      if (navigator.share) await navigator.share({ title: 'My myOdd codes', text: `${slips.length} SportyBet codes`, url });
      else { await copyText(url); setStatus('Collection link copied'); }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setStatus('Could not share this collection.');
    }
  }
  return <section className="codes-section" aria-label="Booking codes">
    <div className="codes-heading"><div><h2>{slips.length} {splitDetails ? 'parts' : 'codes'}</h2></div><div className="bulk-actions"><button onClick={copyAll} disabled={!slips.length || checkingCopy} className="primary-button">{checkingCopy ? 'Checking…' : 'Copy all'}</button><button onClick={shareAll} className="outline-button">Share</button></div></div>
    {status && <p className="action-status" role="status">{status}</p>}
    <ul className="code-grid">{slips.map((slip, index) => {
      const label = STATUS_LABEL[slip.displayStatus ?? (expired(slip) ? 'EXPIRED' : 'ACTIVE')];
      return <li key={slip.id} className={`code-card ${expired(slip) || slip.displayStatus === 'UNAVAILABLE' ? 'is-expired' : ''}`}>
      <div className="card-top"><span className="card-index">{String(index + 1).padStart(2, '0')}</span><span className="code-badge">{label} · {slip.selectionCount} picks</span>{onEdit && <button type="button" onClick={() => onEdit(slip.bookingCode)} className="card-edit-icon" aria-label={`Edit ${slip.bookingCode}`} title="Edit this code">✎</button>}</div>
      <Link className="booking-code" href={`/code/${slip.bookingCode}`}>{slip.bookingCode}</Link><div className="odds-line"><span>Total odds</span><strong title={`Exact odds: ${exactOdds(slip.totalOdds)}`} aria-label={`${formatOdds(slip.totalOdds)} odds; exact total ${exactOdds(slip.totalOdds)}`}>{formatOdds(slip.totalOdds)}</strong></div>
      <ShareButtons code={slip.bookingCode} selectionCount={slip.selectionCount} totalOdds={slip.totalOdds} shareUrl={slip.shareUrl} expired={!actionable(slip)} />
      <details className="pick-details"><summary>View picks <span>+</span></summary><ul>{slip.selections.map((pick, i) => <li key={i}><strong>{pick.homeTeam} vs {pick.awayTeam}</strong><span>{pick.marketName}: {pick.selectionName} <b>{formatOdds(pick.odds)}</b></span></li>)}</ul>{actionable(slip) && <VerifiedBookmakerLink code={slip.bookingCode} url={slip.shareUrl} />}</details>
    </li>;
    })}</ul>
    {!slips.length && <p className="empty-state">No codes yet.</p>}
  </section>;
}

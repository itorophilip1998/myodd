'use client';
import { formatOdds, exactOdds } from '@myodd/shared';
import { useState } from 'react';
import type { GeneratedSlip, GenerationReport } from '@/lib/api';
import { api } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { VerifiedBookmakerLink } from './VerifiedBookmakerLink';
import { ShareButtons } from './ShareButtons';
import Link from 'next/link';

export function SlipGroups({ slips, groupPublicId, onEdit, splitDetails }: { slips: GeneratedSlip[]; groupPublicId: string; onEdit?: (code: string) => void; splitDetails?: GenerationReport['splitDetails'] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sort, setSort] = useState('default');
  const [hiddenCodes, setHiddenCodes] = useState<Set<string>>(new Set());
  const [checkingCopy, setCheckingCopy] = useState(false);
  const [status, setStatus] = useState('');
  const expired = (slip: GeneratedSlip) => !!slip.expiresAt && new Date(slip.expiresAt).getTime() <= Date.now();
  const active = slips.filter(s => !expired(s) && !hiddenCodes.has(s.bookingCode));
  const visible = active.filter(s => `${s.bookingCode} ${s.totalOdds} ${s.selections.map(p => `${p.homeTeam} ${p.awayTeam}`).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  if (sort !== 'default') visible.sort((a, b) => sort === 'high' ? b.totalOdds - a.totalOdds : a.totalOdds - b.totalOdds);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * pageSize;
  const pageSlips = visible.slice(offset, offset + pageSize);
  async function copyAll() {
    setCheckingCopy(true);
    try { const checked = await api.verifyGroup(groupPublicId); const valid = new Set(checked.codes);
      setHiddenCodes(new Set(slips.filter(s => !valid.has(s.bookingCode)).map(s => s.bookingCode)));
      if (!checked.codes.length) { setStatus('No active codes remain. Generate a fresh collection.'); return; }
      await copyText([...valid].join('\n')); setStatus(`Copied ${valid.size} freshly verified codes${checked.unavailable ? ` · ${checked.unavailable} unavailable tickets excluded` : ''}`);
    } catch { setStatus('Could not verify codes right now. Please try again.'); } finally { setCheckingCopy(false); }
  }
  async function shareAll() { const url = `${window.location.origin}/g/${groupPublicId}`; try { await api.publishGroup(groupPublicId); if (navigator.share) await navigator.share({ title: 'My myOdd codes', text: `${active.length} SportyBet codes`, url }); else { await copyText(url); setStatus('Collection link copied'); } } catch (error) { if ((error as Error).name !== 'AbortError') setStatus('Could not share this collection'); } }
  return <section className="codes-section" aria-label="Booking codes">
    <div className="codes-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h2>{slips.length} {splitDetails ? 'parts' : 'codes'}<span className="heading-dot">.</span></h2></div><div className="bulk-actions"><button onClick={copyAll} disabled={!active.length || checkingCopy} className="primary-button">{checkingCopy ? 'Checking…' : 'Copy all'} <span aria-hidden>⧉</span></button><button onClick={shareAll} title="Make this collection public and share its link" className="outline-button">Share collection ↗</button></div></div>
    {splitDetails && <p className="split-result-note">{splitDetails.eligibleSelections} original picks · {splitDetails.strategy} · {splitDetails.skippedSelections} unavailable · no repeated picks</p>}
    <div className="codes-toolbar"><label className="code-search"><span aria-hidden>⌕</span><input aria-label="Search codes or teams" placeholder="Find a code or team" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><select aria-label="Sort codes" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="default">Recommended order</option><option value="low">Odds: low to high</option><option value="high">Odds: high to low</option></select><select aria-label="Tickets per page" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}><option value={12}>12 / page</option><option value={24}>24 / page</option><option value={48}>48 / page</option></select><span className="result-count">{visible.length} of {slips.length}</span></div>
    {status && <p className="action-status" role="status">{status}</p>}
    <div className="code-pages"><ul className="code-grid">{pageSlips.map((slip, index) => <li key={slip.id} className={`code-card ${expired(slip) ? 'is-expired' : ''}`}>
      <div className="card-top"><span className="card-index">{String(offset + index + 1).padStart(2, '0')}</span><span className="code-badge">{expired(slip) ? 'Archived' : `${slip.selectionCount} picks`}</span>{onEdit && <button type="button" onClick={() => onEdit(slip.bookingCode)} className="card-edit-icon" aria-label={`Edit ${slip.bookingCode}`} title="Edit this code">✎</button>}</div>
      <Link className="booking-code" href={`/code/${slip.bookingCode}`}>{slip.bookingCode}</Link><div className="odds-line"><span>Total odds</span><strong title={`Exact odds: ${exactOdds(slip.totalOdds)}`} aria-label={`${formatOdds(slip.totalOdds)} odds; exact total ${exactOdds(slip.totalOdds)}`}>{formatOdds(slip.totalOdds)}</strong></div>
      <ShareButtons code={slip.bookingCode} selectionCount={slip.selectionCount} totalOdds={slip.totalOdds} shareUrl={slip.shareUrl} expired={expired(slip)} onUnavailable={() => setHiddenCodes(current => new Set([...current, slip.bookingCode]))} />
      <details className="pick-details"><summary>View picks <span>+</span></summary><ul>{slip.selections.map((pick, i) => <li key={i}><strong>{pick.homeTeam} vs {pick.awayTeam}</strong><span>{pick.marketName}: {pick.selectionName} <b>{formatOdds(pick.odds)}</b></span></li>)}</ul>{!expired(slip) && <VerifiedBookmakerLink code={slip.bookingCode} url={slip.shareUrl} onUnavailable={() => setHiddenCodes(current => new Set([...current, slip.bookingCode]))} />}</details>
    </li>)}</ul>{!visible.length && <p className="empty-state">No codes match your search.</p>}</div>
    {visible.length > 0 && <nav className="result-pagination" aria-label="Result pages"><span>{offset + 1}–{Math.min(offset + pageSize, visible.length)} of {visible.length} tickets</span><div><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>←</button>{Array.from({ length: pages }, (_, i) => i + 1).filter(n => n === 1 || n === pages || Math.abs(n - currentPage) <= 1).map((n, i, list) => <span key={n}>{i > 0 && n - list[i - 1] > 1 && <small>…</small>}<button aria-label={`Page ${n}`} aria-current={n === currentPage ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button></span>)}<button aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>→</button></div></nav>}
    <p className="collection-note">Codes are saved automatically. Reuse lasts up to 7 days; matches and bookmaker availability can end sooner.</p>
  </section>;
}

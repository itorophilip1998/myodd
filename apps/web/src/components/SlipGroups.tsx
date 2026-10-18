'use client';
import { formatOdds, exactOdds } from '@myodd/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { GeneratedSlip, GenerationReport, LegPlayStatus, PlaySummary, SlipPlayStatus } from '@/lib/api';
import { api } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { formatLagosDateTime } from '@/lib/datetime';
import { modeTag } from '@/lib/mode-label';
import { loadTicketOnSportyBet, sportyLoadUrl } from '@/lib/sportybet';
import { formatTicketCopy, formatTicketsCopy } from '@/lib/ticket-copy';
import { useToast } from './ToastProvider';
import { useUiSound } from './SettingsProvider';
import { VerifiedBookmakerLink } from './VerifiedBookmakerLink';
import { CollectionMenu } from './CollectionMenu';
import Link from 'next/link';
import type { CollectionSummary } from '@/lib/api';

const STATUS_LABEL: Record<NonNullable<GeneratedSlip['displayStatus']>, string> = {
  ACTIVE: 'Active',
  CHECKING: 'Checking…',
  PARTIAL: 'Partial',
  UNAVAILABLE: 'Unavailable',
  EXPIRED: 'Expired',
  UNKNOWN: 'Stored',
};

function isDoneSlip(status?: SlipPlayStatus | null) {
  return status === 'ALL_PLAYED' || status === 'CUT';
}

function isDoneLeg(status?: LegPlayStatus | null) {
  return status === 'PLAYED' || status === 'CUT';
}

const PLAY_LABEL: Record<SlipPlayStatus, string> = {
  OPEN: 'Open',
  LIVE: 'Live',
  CUT: 'Done',
  ALL_PLAYED: 'Done',
  UNKNOWN: 'Not checked',
};

const LEG_LABEL: Record<LegPlayStatus, string> = {
  UPCOMING: 'Upcoming',
  LIVE: 'Live',
  PLAYED: 'Done',
  CUT: 'Done',
  UNKNOWN: 'Unknown',
};

function summarizeLocal(slips: GeneratedSlip[]): PlaySummary {
  const done = slips.filter(s => isDoneSlip(s.playStatus)).length;
  const legsDone = slips.reduce((n, s) => n + (s.playedLegs ?? 0) + (s.cutLegs ?? 0), 0);
  return {
    tickets: slips.length,
    open: slips.filter(s => s.playStatus === 'OPEN').length,
    live: slips.filter(s => s.playStatus === 'LIVE').length,
    done,
    unknown: slips.filter(s => !s.playStatus || s.playStatus === 'UNKNOWN').length,
    legsOpen: slips.reduce((n, s) => n + (s.openLegs ?? 0), 0),
    legsLive: slips.reduce((n, s) => n + (s.liveLegs ?? 0), 0),
    legsDone,
  };
}

function playLine(summary: PlaySummary) {
  const done = summary.done ?? summary.allPlayed ?? 0;
  const bits = [
    summary.live ? `${summary.live} live` : '',
    summary.open ? `${summary.open} open` : '',
    done ? `${done} done` : '',
  ].filter(Boolean);
  return bits.join(' · ') || 'No play check yet';
}

function TicketMenu({
  open,
  onOpenChange,
  onViewPicks,
  onVerify,
  onEdit,
  onCopy,
  onShare,
  onLoad,
  verifying,
  loading,
  canVerify,
  canEdit,
  canLoad,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewPicks: () => void;
  onVerify?: () => void;
  onEdit?: () => void;
  onCopy: () => void;
  onShare: () => void;
  onLoad: () => void;
  verifying?: boolean;
  loading?: boolean;
  canVerify?: boolean;
  canEdit?: boolean;
  canLoad?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !root.current) { setPos(null); return; }
    const place = () => {
      const rect = root.current!.getBoundingClientRect();
      const width = 176;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      const estimatedHeight = 220;
      const openUp = rect.top > estimatedHeight + 12;
      const top = openUp ? rect.top - 6 : rect.bottom + 6;
      setPos({ top, left, openUp });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (root.current?.contains(t) || panel.current?.contains(t)) return;
      onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  function run(action: () => void) {
    onOpenChange(false);
    window.setTimeout(action, 0);
  }

  const menu = open && pos && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panel}
        className="ticket-menu-panel ticket-menu-panel-fixed"
        role="menu"
        aria-label="Ticket actions"
        style={{ top: pos.top, left: pos.left, transform: pos.openUp ? 'translateY(-100%)' : undefined }}
        onClick={e => e.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={() => run(onViewPicks)}>
          <span aria-hidden>◈</span>View picks
        </button>
        <button type="button" role="menuitem" disabled={!canLoad || loading} onClick={() => run(onLoad)}>
          <span aria-hidden>↗</span>{loading ? 'Loading…' : 'Load ticket'}
        </button>
        <button type="button" role="menuitem" onClick={() => run(onShare)}>
          <span aria-hidden>⎘</span>Share
        </button>
        <button type="button" role="menuitem" onClick={() => run(onCopy)}>
          <span aria-hidden>▣</span>Copy ticket
        </button>
        {canVerify && (
          <button type="button" role="menuitem" disabled={verifying} onClick={() => run(() => onVerify?.())}>
            <span aria-hidden>✓</span>{verifying ? 'Checking…' : 'Verify played'}
          </button>
        )}
        {canEdit && (
          <button type="button" role="menuitem" onClick={() => run(() => onEdit?.())}>
            <span aria-hidden>✎</span>Edit ticket
          </button>
        )}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`ticket-menu${open ? ' is-open' : ''}`} ref={root}>
      <button
        type="button"
        className="ticket-menu-trigger"
        aria-label="Ticket actions"
        aria-expanded={open}
        title="Ticket actions"
        onClick={e => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {menu}
    </div>
  );
}

function ShareSheet({
  slip,
  groupUrl,
  collectionMode,
  onClose,
}: {
  slip: GeneratedSlip;
  groupUrl: string;
  collectionMode?: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const mode = slip.riskMode ?? collectionMode ?? null;
  const text = formatTicketCopy(slip, mode);
  const loadUrl = sportyLoadUrl(slip.bookingCode, slip.shareUrl);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="picks-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="share-sheet" role="dialog" aria-modal="true" aria-label={`Share ${slip.bookingCode}`} onClick={e => e.stopPropagation()}>
        <div className="picks-modal-head">
          <div>
            <p className="eyebrow">SHARE</p>
            <h3>{slip.bookingCode}</h3>
          </div>
          <button type="button" className="match-day-icon-btn" aria-label="Close share" onClick={onClose}>✕</button>
        </div>
        <p className="share-sheet-text">{text}</p>
        <div className="share-sheet-actions">
          <a className="primary-button" href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${loadUrl}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <a className="outline-button" href={`https://t.me/share/url?url=${encodeURIComponent(loadUrl)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Telegram</a>
          <button type="button" className="outline-button" onClick={async () => {
            try {
              await copyText(`${text}\n${groupUrl || loadUrl}`);
              toast('Link copied');
            } catch {
              toast('Could not copy link');
            }
          }}>Copy link</button>
          <button type="button" className="outline-button" onClick={async () => {
            try {
              await copyText(text);
              toast('Ticket copied');
            } catch {
              toast('Could not copy ticket');
            }
          }}>Copy ticket</button>
        </div>
      </div>
    </div>
  );
}

function PicksModal({
  slip,
  modeLabel,
  modeKey,
  playLabel,
  collectionMode,
  onClose,
  onShare,
}: {
  slip: GeneratedSlip;
  modeLabel: string | null;
  modeKey: string;
  playLabel: string | null;
  collectionMode?: string | null;
  onClose: () => void;
  onShare: () => void;
}) {
  const toast = useToast();
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="picks-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="picks-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Picks for ${slip.bookingCode}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="picks-modal-head">
          <div>
            <p className="eyebrow">TICKET DETAILS</p>
            <h3>{slip.bookingCode}</h3>
            <div className="picks-modal-tags">
              {modeLabel && <span className={`mode-tag mode-${modeKey}`}>{modeLabel}</span>}
              {playLabel && <span className={`play-chip play-${isDoneSlip(slip.playStatus) ? 'all_played' : (slip.playStatus ?? 'UNKNOWN').toLowerCase()}`}>{playLabel}</span>}
              <span className="code-badge">{STATUS_LABEL[slip.displayStatus ?? 'UNKNOWN']} · {slip.selectionCount} picks</span>
            </div>
          </div>
          <button type="button" className="match-day-icon-btn" aria-label="Close picks" onClick={onClose}>✕</button>
        </div>
        <div className="picks-modal-meta">
          <span>Odds <strong title={exactOdds(slip.totalOdds)}>{formatOdds(slip.totalOdds)}</strong></span>
          {slip.createdAt && <time dateTime={slip.createdAt}>{formatLagosDateTime(slip.createdAt)}</time>}
          <Link href={`/code/${slip.bookingCode}`} onClick={onClose}>Open ticket page ↗</Link>
        </div>
        <ul className="picks-modal-list">
          {slip.selections.map((pick, i) => (
            <li key={i} className={pick.playStatus === 'LIVE' ? 'is-live-leg' : isDoneLeg(pick.playStatus) ? 'is-played-leg' : ''}>
              <div className="picks-modal-row">
                <strong>{pick.homeTeam} vs {pick.awayTeam}</strong>
                {pick.playStatus && pick.playStatus !== 'UNKNOWN' && (
                  <span className={`play-chip play-${isDoneLeg(pick.playStatus) ? 'all_played' : pick.playStatus.toLowerCase()}`}>{LEG_LABEL[pick.playStatus]}</span>
                )}
              </div>
              <span className="picks-modal-league">{pick.league}</span>
              <span>{pick.marketName}: {pick.selectionName} <b>{formatOdds(pick.odds)}</b></span>
              {(pick.score || pick.playNote || pick.kickoffAt) && (
                <span className="pick-play">
                  {pick.score ? pick.score : ''}
                  {pick.playNote ? `${pick.score ? ' · ' : ''}${pick.playNote}` : ''}
                  {pick.kickoffAt ? `${pick.score || pick.playNote ? ' · ' : ''}${formatLagosDateTime(pick.kickoffAt)}` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="picks-modal-foot">
          <VerifiedBookmakerLink code={slip.bookingCode} url={slip.shareUrl} />
          <button type="button" className="outline-button" onClick={async () => {
            try {
              await copyText(formatTicketCopy(slip, collectionMode));
              toast('Ticket copied');
            } catch {
              toast('Could not copy ticket');
            }
          }}>Copy ticket</button>
          <button type="button" className="outline-button" onClick={onShare}>Share</button>
        </div>
      </div>
    </div>
  );
}

export function SlipGroups({
  slips,
  groupPublicId,
  onEdit,
  collection,
  splitDetails,
  playSummary,
  createdAt,
  riskMode,
  allowPlayCheck = false,
}: {
  slips: GeneratedSlip[];
  groupPublicId: string;
  onEdit?: (code: string) => void;
  collection?: Pick<CollectionSummary, 'publicId' | 'title' | 'isPublic' | 'isOwner' | 'creator'>;
  splitDetails?: GenerationReport['splitDetails'];
  playSummary?: PlaySummary;
  createdAt?: string;
  riskMode?: string | null;
  allowPlayCheck?: boolean;
}) {
  const toast = useToast();
  const play = useUiSound();
  const query = useQueryClient();
  const [checkingCopy, setCheckingCopy] = useState(false);
  const [checkingPlay, setCheckingPlay] = useState(false);
  const [checkingTicket, setCheckingTicket] = useState<string | null>(null);
  const [loadingTicket, setLoadingTicket] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [picksFor, setPicksFor] = useState<GeneratedSlip | null>(null);
  const [shareFor, setShareFor] = useState<GeneratedSlip | null>(null);
  const [playFilter, setPlayFilter] = useState<'DONE' | 'LIVE' | 'OPEN' | null>(null);
  const summary = useMemo(() => {
    const base = playSummary ?? summarizeLocal(slips);
    const done = base.done ?? base.allPlayed ?? 0;
    const legsDone = base.legsDone ?? ((base.legsPlayed ?? 0) + (base.legsCut ?? 0));
    return { ...base, done, legsDone };
  }, [playSummary, slips]);
  const visibleSlips = useMemo(() => {
    if (!playFilter) return slips;
    if (playFilter === 'DONE') return slips.filter(s => isDoneSlip(s.playStatus));
    return slips.filter(s => s.playStatus === playFilter);
  }, [slips, playFilter]);
  const collectionMode = modeTag(riskMode) ?? modeTag(slips[0]?.riskMode);
  const groupUrl = typeof window !== 'undefined' ? `${window.location.origin}/g/${groupPublicId}` : `/g/${groupPublicId}`;
  const expired = (slip: GeneratedSlip) => slip.displayStatus === 'EXPIRED' || (!!slip.expiresAt && new Date(slip.expiresAt).getTime() <= Date.now());
  const canLoad = (slip: GeneratedSlip) => !expired(slip) || !!slip.shareUrl;

  function togglePlayFilter(next: 'DONE' | 'LIVE' | 'OPEN') {
    play('click');
    setPlayFilter(current => current === next ? null : next);
    setMenuFor(null);
  }

  async function copyAll() {
    setCheckingCopy(true);
    try {
      const checked = await api.verifyGroup(groupPublicId);
      const valid = new Set(checked.codes.map(code => code.toUpperCase()));
      const active = slips.filter(slip => valid.has(slip.bookingCode.toUpperCase()));
      if (!active.length) { toast('No active codes right now.', { sticky: true }); return; }
      await copyText(formatTicketsCopy(active, riskMode));
      toast(`Copied ${active.length} tickets${checked.unavailable ? ` · ${checked.unavailable} skipped` : ''}`);
    } catch {
      toast('Could not verify codes right now.', { sticky: true });
    } finally { setCheckingCopy(false); }
  }

  function shareAll() {
    const url = `${window.location.origin}/g/${groupPublicId}`;
    // Publish in the background — do not await before share (loses user gesture).
    void api.publishGroup(groupPublicId).then(() => {
      toast('Now public');
      void query.invalidateQueries({ queryKey: ['group', groupPublicId] });
    }).catch(() => {});
    if (typeof navigator.share === 'function') {
      void navigator.share({ title: 'My myOdd codes', text: `${slips.length} SportyBet codes`, url }).catch(async error => {
        if ((error as Error).name === 'AbortError') return;
        try {
          await copyText(url);
          toast('Link copied');
        } catch {
          toast('Could not share this collection.', { sticky: true });
        }
      });
      return;
    }
    void copyText(url).then(() => {
      toast('Link copied');
    }).catch(() => toast('Could not share this collection.', { sticky: true }));
  }

  async function checkAllPlayed() {
    setCheckingPlay(true);
    play('submit');
    try {
      const result = await api.checkPlayGroup(groupPublicId);
      await Promise.all([
        query.invalidateQueries({ queryKey: ['group', groupPublicId] }),
        query.invalidateQueries({ queryKey: ['history'] }),
      ]);
      play('done');
      toast(playLine(result.summary), { sticky: true });
    } catch {
      play('error');
      toast('Could not check play results.', { sticky: true });
    } finally { setCheckingPlay(false); }
  }

  async function checkTicket(code: string) {
    setCheckingTicket(code);
    play('click');
    try {
      const result = await api.checkPlayCode(code);
      await Promise.all([
        query.invalidateQueries({ queryKey: ['group', groupPublicId] }),
        query.invalidateQueries({ queryKey: ['code', code] }),
        query.invalidateQueries({ queryKey: ['history'] }),
      ]);
      play(isDoneSlip(result.playStatus) ? 'done' : result.playStatus === 'LIVE' ? 'tick' : 'tick');
      const doneLegs = result.playedLegs || 0;
      toast(`${code}: ${PLAY_LABEL[result.playStatus]}${doneLegs ? ` · ${doneLegs} done` : ''}${result.liveLegs ? ` · ${result.liveLegs} live` : ''}`, { sticky: true });
    } catch {
      play('error');
      toast('Could not check this ticket.', { sticky: true });
    } finally { setCheckingTicket(null); }
  }

  async function copyOne(slip: GeneratedSlip) {
    try {
      await copyText(formatTicketCopy(slip, riskMode));
      toast('Copied');
    } catch {
      toast('Could not copy this ticket', { sticky: true });
    }
  }

  async function loadOne(slip: GeneratedSlip) {
    setLoadingTicket(slip.bookingCode);
    play('submit');
    try {
      await loadTicketOnSportyBet(slip.bookingCode, slip.shareUrl);
      toast('Opening SportyBet…');
    } catch (e) {
      play('error');
      toast((e as Error).message || 'Could not load ticket', { sticky: true });
    } finally {
      setLoadingTicket(null);
    }
  }

  const picksModeLabel = picksFor ? (modeTag(picksFor.riskMode) ?? collectionMode) : null;
  const picksModeKey = picksFor ? (picksFor.riskMode ?? riskMode ?? '').toLowerCase() : '';
  const picksPlayLabel = picksFor?.playStatus && picksFor.playStatus !== 'UNKNOWN' ? PLAY_LABEL[picksFor.playStatus] : null;

  return <section className="codes-section" aria-label="Booking codes">
    <div className="codes-heading">
      <div>
        <h2>{slips.length} {splitDetails ? 'parts' : 'codes'}{collectionMode && <span className={`mode-tag mode-${(riskMode ?? slips[0]?.riskMode ?? '').toLowerCase()}`}>{collectionMode}</span>}</h2>
        {createdAt && <p className="codes-meta"><time dateTime={createdAt}>{formatLagosDateTime(createdAt)}</time></p>}
      </div>
      <div className="bulk-actions">
        {allowPlayCheck && <button onClick={() => void checkAllPlayed()} disabled={!slips.length || checkingPlay} className="outline-button">{checkingPlay ? 'Checking…' : 'Verify played'}</button>}
        <button onClick={() => void copyAll()} disabled={!slips.length || checkingCopy} className="primary-button">{checkingCopy ? 'Checking…' : 'Copy all'}</button>
        {collection && (
          <CollectionMenu
            collection={collection}
            onShare={() => void shareAll()}
          />
        )}
      </div>
    </div>
    {slips.length > 0 && (allowPlayCheck || summary.done + summary.live + summary.open > 0) && <div className="play-kpi" aria-label="Filter by play result" role="toolbar">
      <button type="button" className={`play-kpi-btn play-live${playFilter === 'LIVE' ? ' is-active' : ''}`} aria-pressed={playFilter === 'LIVE'} onClick={() => togglePlayFilter('LIVE')} disabled={!summary.live}>
        <b>{summary.live}</b> live
      </button>
      <button type="button" className={`play-kpi-btn play-open${playFilter === 'OPEN' ? ' is-active' : ''}`} aria-pressed={playFilter === 'OPEN'} onClick={() => togglePlayFilter('OPEN')} disabled={!summary.open}>
        <b>{summary.open}</b> open
      </button>
      <button type="button" className={`play-kpi-btn play-all_played${playFilter === 'DONE' ? ' is-active' : ''}`} aria-pressed={playFilter === 'DONE'} onClick={() => togglePlayFilter('DONE')} disabled={!summary.done}>
        <b>{summary.done}</b> done
      </button>
      <span className="play-kpi-legs">{summary.legsLive} live · {summary.legsDone} done{playFilter ? ` · showing ${visibleSlips.length}` : ''}</span>
      {playFilter && (
        <button type="button" className="play-kpi-clear" onClick={() => { play('click'); setPlayFilter(null); }}>Show all</button>
      )}
    </div>}
    <ul className="code-grid">{visibleSlips.map((slip, index) => {
      const label = STATUS_LABEL[slip.displayStatus ?? (expired(slip) ? 'EXPIRED' : 'ACTIVE')];
      const playLabel = slip.playStatus && slip.playStatus !== 'UNKNOWN' ? PLAY_LABEL[slip.playStatus] : null;
      const ticketMode = modeTag(slip.riskMode) ?? collectionMode;
      const ticketModeKey = (slip.riskMode ?? riskMode ?? '').toLowerCase();
      const gamesLabel = `${slip.selectionCount} ${slip.selectionCount === 1 ? 'game' : 'games'}`;
      return (
        <li key={slip.id} className={`code-card ${expired(slip) || slip.displayStatus === 'UNAVAILABLE' ? 'is-expired' : ''} ${isDoneSlip(slip.playStatus) ? 'is-played' : ''} ${slip.playStatus === 'LIVE' ? 'is-live' : ''} ${menuFor === slip.id ? 'is-menu-open' : ''}`}>
          <button
            type="button"
            className="code-card-main"
            onClick={() => { play('click'); setMenuFor(null); setPicksFor(slip); }}
            aria-label={`Open ${slip.bookingCode} details · ${gamesLabel}`}
          >
            <div className="card-top">
              <span className="card-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="code-badge">{label} · {gamesLabel}</span>
            </div>
            <span className="booking-code">{slip.bookingCode}</span>
            <div className="odds-line">
              <span>Total odds</span>
              <strong title={`Exact odds: ${exactOdds(slip.totalOdds)}`} aria-label={`${formatOdds(slip.totalOdds)} odds; exact total ${exactOdds(slip.totalOdds)}`}>{formatOdds(slip.totalOdds)}</strong>
            </div>
            {slip.createdAt && (
              <div className="ticket-meta">
                <time dateTime={slip.createdAt}>{formatLagosDateTime(slip.createdAt)}</time>
              </div>
            )}
          </button>
          <div className="ticket-footer">
            <div className="ticket-tags">
              {ticketMode && <span className={`mode-tag mode-${ticketModeKey}`}>{ticketMode}</span>}
              {playLabel && <span className={`play-chip play-${isDoneSlip(slip.playStatus) ? 'all_played' : (slip.playStatus ?? 'UNKNOWN').toLowerCase()}`}>{playLabel}</span>}
            </div>
            <TicketMenu
              open={menuFor === slip.id}
              onOpenChange={open => setMenuFor(open ? slip.id : null)}
              onViewPicks={() => { play('click'); setPicksFor(slip); }}
              onVerify={allowPlayCheck ? () => void checkTicket(slip.bookingCode) : undefined}
              onEdit={onEdit ? () => onEdit(slip.bookingCode) : undefined}
              onCopy={() => void copyOne(slip)}
              onShare={() => { play('click'); setShareFor(slip); }}
              onLoad={() => void loadOne(slip)}
              verifying={checkingTicket === slip.bookingCode}
              loading={loadingTicket === slip.bookingCode}
              canVerify={allowPlayCheck}
              canEdit={!!onEdit}
              canLoad={canLoad(slip)}
            />
          </div>
        </li>
      );
    })}</ul>
    {!slips.length && <p className="empty-state">No codes yet.</p>}
    {!!slips.length && !visibleSlips.length && playFilter && (
      <p className="empty-state">No {playFilter === 'DONE' ? 'done' : playFilter.toLowerCase()} tickets. <button type="button" className="text-link" onClick={() => setPlayFilter(null)}>Show all</button></p>
    )}
    {picksFor && (
      <PicksModal
        slip={picksFor}
        modeLabel={picksModeLabel}
        modeKey={picksModeKey}
        playLabel={picksPlayLabel}
        collectionMode={riskMode}
        onClose={() => setPicksFor(null)}
        onShare={() => { setPicksFor(null); setShareFor(picksFor); }}
      />
    )}
    {shareFor && (
      <ShareSheet
        slip={shareFor}
        groupUrl={groupUrl}
        collectionMode={riskMode}
        onClose={() => setShareFor(null)}
      />
    )}
  </section>;
}

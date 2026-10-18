'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api, accountApi, type CollectionSummary } from '@/lib/api';
import { CollectionMenu } from '@/components/CollectionMenu';
import { LogoLoader } from '@/components/LogoLoader';
import { useAccountSession, SignInPrompt } from '@/components/AccountSession';
import { formatLagosDateTime } from '@/lib/datetime';
import { modeTag } from '@/lib/mode-label';
import { useToast } from '@/components/ToastProvider';
import { useUiSound } from '@/components/SettingsProvider';

type Layout = 'grid' | 'compact' | 'list';

function playBadge(group: CollectionSummary) {
  const live = group.live ?? 0;
  const open = group.open ?? 0;
  const done = group.done ?? group.allPlayed ?? group.cut ?? 0;
  const total = group.slipCount || live + open + done;

  // Live always wins. Done only when tickets have finished running.
  if (live > 0) return { label: `${live} live`, className: 'play-live' };
  if (open > 0) return { label: `${open} open`, className: 'play-open' };
  if (done > 0) return { label: done === total ? 'Done' : `${done} done`, className: 'play-all_played' };
  if (group.playResult === 'UNKNOWN' || !group.playCheckedAt) return { label: 'Unchecked', className: 'play-unknown' };
  return { label: 'Unchecked', className: 'play-unknown' };
}

function mainTag(group: CollectionSummary) {
  const mode = modeTag(group.riskMode);
  if (mode) {
    return { label: mode, className: `mode-tag mode-${(group.riskMode ?? '').toLowerCase()}` };
  }
  return {
    label: group.isPublic ? 'Public' : 'Private',
    className: group.isPublic ? 'library-vis-tag is-public' : 'library-vis-tag is-private',
  };
}

export default function HistoryPage() {
  const session = useAccountSession();
  const [tab, setTab] = useState<'public' | 'mine'>(session.signedIn ? 'mine' : 'public');
  const [layout, setLayout] = useState<Layout>('compact');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const toast = useToast();
  const play = useUiSound();
  const client = useQueryClient();
  const mine = tab === 'mine';
  const errorTold = useRef('');

  useEffect(() => { try { const saved = localStorage.getItem('myodd-library-layout'); if (saved === 'grid' || saved === 'compact' || saved === 'list') setLayout(saved); } catch {} }, []);
  function changeLayout(value: Layout) { setLayout(value); try { localStorage.setItem('myodd-library-layout', value); } catch {} }
  function changeTab(value: 'mine' | 'public') { setTab(value); setSelected(new Set()); setSelecting(false); setSearch(''); }

  const query = useInfiniteQuery({
    queryKey: ['history', session.userId, tab],
    enabled: !mine || session.signedIn,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => mine ? api.listGroups(pageParam) : api.publicGroups(pageParam),
    getNextPageParam: (last, pages) => last.length === 50 ? pages.length + 1 : undefined,
  });

  useEffect(() => {
    if (!query.error) return;
    const message = query.error.message;
    if (errorTold.current === message) return;
    errorTold.current = message;
    toast(message, {
      sticky: true,
      action: { label: 'Retry', onClick: () => { void query.refetch(); } },
    });
  }, [query.error, query, toast]);

  const groups = (query.data?.pages.flat() ?? []).filter(g => `${g.title} ${g.originalBookingCode ?? ''} ${modeTag(g.riskMode) ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const selectable = mine ? groups.filter(g => g.isOwner).slice(0, 100) : [];
  const allSelected = selectable.length > 0 && selectable.every(g => selected.has(g.publicId));
  const verifyTargets = selected.size ? [...selected] : groups.filter(g => g.isOwner).map(g => g.publicId);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refresh() {
    await client.invalidateQueries({ queryKey: ['history'] });
    await client.invalidateQueries({ queryKey: ['group'] });
  }

  async function restore(ids: string[]) {
    setPending(true);
    try {
      await Promise.all(ids.map(id => accountApi.save(id)));
      await refresh();
      toast('Collections restored.');
    } catch (e) { toast((e as Error).message); }
    finally { setPending(false); }
  }

  async function remove(ids: string[], confirmed = false) {
    if (!confirmed && !window.confirm(`Delete ${ids.length} collection${ids.length === 1 ? '' : 's'} from your saved list?`)) return false;
    setPending(true);
    try {
      const result = await accountApi.remove(ids);
      setSelected(new Set());
      await refresh();
      const removed = result.removed;
      toast(
        `${removed.length} collection${removed.length === 1 ? '' : 's'} removed.`,
        { label: 'Undo', onClick: () => { void restore(removed); } },
      );
      return true;
    } catch (e) { toast((e as Error).message); return false; }
    finally { setPending(false); }
  }

  async function verifyCollections(ids: string[]) {
    if (!ids.length) { toast('No collections to verify.'); return; }
    setVerifying('bulk');
    play('submit');
    let done = 0, other = 0, failed = 0;
    try {
      for (const id of ids) {
        try {
          const result = await api.checkPlayGroup(id);
          const doneCount = result.summary.done ?? result.summary.allPlayed ?? 0;
          if (doneCount > 0 && doneCount === result.summary.tickets) done++;
          else other++;
        } catch {
          failed++;
        }
      }
      await refresh();
      play(failed > 0 ? 'error' : 'done');
      toast(`Verified ${ids.length - failed} · ${done} done${other ? ` · ${other} open/live` : ''}${failed ? ` · ${failed} failed` : ''}`);
    } finally {
      setVerifying(null);
    }
  }

  async function verifyOne(id: string) {
    setVerifying(id);
    play('click');
    try {
      const result = await api.checkPlayGroup(id);
      await refresh();
      const doneCount = result.summary.done ?? result.summary.allPlayed ?? 0;
      const bits = [
        result.summary.live ? `${result.summary.live} live` : '',
        result.summary.open ? `${result.summary.open} open` : '',
        doneCount ? `${doneCount} done` : '',
      ].filter(Boolean);
      play('done');
      toast(bits.join(' · ') || 'Checked');
    } catch (e) {
      play('error');
      toast((e as Error).message);
    } finally {
      setVerifying(null);
    }
  }

  return (
    <main className="workspace library-workspace">
      <header className="library-header">
        <div>
          <p className="eyebrow">YOUR CODE LIBRARY</p>
          <h1>Saved codes<span className="heading-dot">.</span></h1>
          <p>Browse public collections, verify played tickets, and keep your own close.</p>
        </div>
        <Link href="/" className="outline-button">＋ Create codes</Link>
      </header>

      <div className="library-navigation">
        <div className="history-tabs" role="group" aria-label="Collection source">
          <button aria-pressed={!mine} onClick={() => changeTab('public')}>Public codes</button>
          <button aria-pressed={mine} onClick={() => changeTab('mine')}>My collections</button>
        </div>
        <div className="library-layouts" role="group" aria-label="Collection layout">
          {(['grid', 'compact', 'list'] as const).map(value => (
            <button key={value} aria-pressed={layout === value} onClick={() => changeLayout(value)} title={`${value} layout`}>
              <span aria-hidden>{value === 'grid' ? '▦' : value === 'compact' ? '▥' : '☰'}</span>
              <span>{value === 'grid' ? 'Grid' : value === 'compact' ? 'Compact' : 'List'}</span>
            </button>
          ))}
        </div>
      </div>

      {mine && !session.signedIn ? <SignInPrompt /> : <>
        <div className="library-toolbar">
          <label className="library-search">
            <span aria-hidden>⌕</span>
            <input type="search" aria-label="Search loaded collections" placeholder="Find a collection or code…" value={search} onChange={e => { setSearch(e.target.value); setSelected(new Set()); }} />
          </label>
          <span className="library-count">{groups.length} loaded</span>
          {mine && session.signedIn && <>
            <button
              className="outline-button"
              disabled={pending || !!verifying || !verifyTargets.length}
              onClick={() => void verifyCollections(verifyTargets)}
            >
              {verifying === 'bulk' ? 'Verifying…' : selected.size ? `Verify selected (${selected.size})` : 'Verify played'}
            </button>
            <button className="outline-button" disabled={pending || !!verifying} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
              {selecting ? 'Done' : 'Select'}
            </button>
          </>}
        </div>

        {mine && session.signedIn && selecting && (
          <div className="library-selection">
            <label>
              <input type="checkbox" checked={allSelected} disabled={pending || !selectable.length} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(g => g.publicId)))} />
              Select loaded <span>({selected.size}/100)</span>
            </label>
            <button className="library-delete" disabled={pending || !selected.size} onClick={() => void remove([...selected])}>
              {pending ? 'Removing…' : `Delete selected (${selected.size})`}
            </button>
          </div>
        )}

        {query.isLoading && <LogoLoader compact label="Finding your collections" />}
        {!query.isLoading && !query.error && !groups.length && (
          <div className="empty-state">
            <p>{search ? 'No matching collections in the loaded results.' : mine ? 'Your saved collections will appear here.' : 'No public collections yet.'}</p>
            <Link href="/" className="primary-button mt-4">Generate codes ↗</Link>
          </div>
        )}

        <ul className={`library-cards layout-${layout}`}>
          {groups.map(group => {
            const badge = playBadge(group);
            const primary = mainTag(group);
            return (
              <li key={group.publicId} className={selected.has(group.publicId) ? 'is-selected' : ''}>
                {mine && session.signedIn && selecting && (
                  <label className="library-checkbox">
                    <input
                      type="checkbox"
                      aria-label={`Select ${group.title}`}
                      checked={selected.has(group.publicId)}
                      disabled={pending || (!selected.has(group.publicId) && selected.size >= 100)}
                      onChange={() => toggle(group.publicId)}
                    />
                  </label>
                )}
                <Link href={`/g/${group.publicId}`} className="library-card-link">
                  <div className="library-card-meta">
                    <span className={primary.className}>{primary.label}</span>
                    <span className={`play-chip ${badge.className}`}>{badge.label}</span>
                    <time dateTime={group.createdAt}>{formatLagosDateTime(group.createdAt)}</time>
                  </div>
                  <h2>{group.title}</h2>
                  <div className="library-card-bottom">
                    <span><b>{group.slipCount}</b> codes</span>
                    <span aria-hidden>↗</span>
                  </div>
                </Link>
                <div className="library-creator">{group.creator ? <span>{group.creator.name}</span> : <span>Community collection</span>}</div>
                <div className="library-card-action">
                  <span>{group.isOwner ? 'Created by you' : 'Public collection'}</span>
                  <div className="library-card-tools">
                    {mine && group.isOwner && (
                      <button
                        type="button"
                        className="library-verify-btn"
                        disabled={!!verifying}
                        onClick={() => void verifyOne(group.publicId)}
                      >
                        {verifying === group.publicId ? '…' : 'Verify'}
                      </button>
                    )}
                    <CollectionMenu collection={group} onDelete={mine && group.isOwner ? () => remove([group.publicId], true) : undefined} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {query.hasNextPage && (
          <button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="outline-button library-more">
            {query.isFetchingNextPage ? 'Loading…' : 'Load more collections'}
          </button>
        )}
      </>}
    </main>
  );
}

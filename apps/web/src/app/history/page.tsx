'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api, accountApi } from '@/lib/api';
import { CollectionMenu } from '@/components/CollectionMenu';
import { LogoLoader } from '@/components/LogoLoader';
import { useAccountSession, SignInPrompt } from '@/components/AccountSession';
type Layout = 'grid' | 'compact' | 'list';
export default function HistoryPage() {
  const session = useAccountSession();
  const [tab, setTab] = useState<'public' | 'mine'>(session.signedIn ? 'mine' : 'public');
  const [layout, setLayout] = useState<Layout>('compact'); const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set()); const [selecting, setSelecting] = useState(false);
  const [pending, setPending] = useState(false); const [notice, setNotice] = useState(''); const [undo, setUndo] = useState<string[]>([]);
  const client = useQueryClient(); const mine = tab === 'mine';
  useEffect(() => { try { const saved = localStorage.getItem('myodd-library-layout'); if (saved === 'grid' || saved === 'compact' || saved === 'list') setLayout(saved); } catch {} }, []);
  function changeLayout(value: Layout) { setLayout(value); try { localStorage.setItem('myodd-library-layout', value); } catch {} }
  function changeTab(value: 'mine' | 'public') { setTab(value); setSelected(new Set()); setSelecting(false); setSearch(''); setNotice(''); }
  const query = useInfiniteQuery({ queryKey: ['history', session.userId, tab], enabled: !mine || session.signedIn, initialPageParam: 1,
    queryFn: ({ pageParam }) => mine ? api.listGroups(pageParam) : api.publicGroups(pageParam),
    getNextPageParam: (last, pages) => last.length === 50 ? pages.length + 1 : undefined });
  const groups = (query.data?.pages.flat() ?? []).filter(g => `${g.title} ${g.originalBookingCode ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const selectable = mine ? groups.filter(g => g.isOwner).slice(0, 100) : [];
  const allSelected = selectable.length > 0 && selectable.every(g => selected.has(g.publicId));
  function toggle(id: string) { setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function refresh() { await client.invalidateQueries({ queryKey: ['history'] }); await client.invalidateQueries({ queryKey: ['group'] }); }
  async function remove(ids: string[]) { setPending(true); setNotice(''); try { const result = await accountApi.remove(ids); setUndo(result.removed); setSelected(new Set()); await refresh(); setNotice(`${result.removed.length} collection${result.removed.length === 1 ? '' : 's'} removed from your saved list.`); return true; } catch (e) { setNotice((e as Error).message); return false; } finally { setPending(false); } }
  async function restore() { setPending(true); try { await Promise.all(undo.map(id => accountApi.save(id))); await refresh(); setUndo([]); setNotice('Collections restored.'); } catch (e) { setNotice((e as Error).message); } finally { setPending(false); } }
  return <main className="workspace library-workspace"><header className="library-header"><div><p className="eyebrow">YOUR CODE LIBRARY</p><h1>Saved codes<span className="heading-dot">.</span></h1><p>Browse public collections or keep your own close.</p></div><Link href="/" className="outline-button">＋ Create codes</Link></header>
    <div className="library-navigation"><div className="history-tabs" role="group" aria-label="Collection source"><button aria-pressed={!mine} onClick={() => changeTab('public')}>Public codes</button><button aria-pressed={mine} onClick={() => changeTab('mine')}>My collections</button></div><div className="library-layouts" role="group" aria-label="Collection layout">{(['grid', 'compact', 'list'] as const).map(value => <button key={value} aria-pressed={layout === value} onClick={() => changeLayout(value)} title={`${value} layout`}><span aria-hidden>{value === 'grid' ? '▦' : value === 'compact' ? '▥' : '☰'}</span><span>{value === 'grid' ? 'Grid' : value === 'compact' ? 'Compact' : 'List'}</span></button>)}</div></div>
    {mine && !session.signedIn ? <SignInPrompt /> : <>
      <div className="library-toolbar"><label className="library-search"><span aria-hidden>⌕</span><input type="search" aria-label="Search loaded collections" placeholder="Find a collection or code…" value={search} onChange={e => { setSearch(e.target.value); setSelected(new Set()); }} /></label><span className="library-count">{groups.length} loaded</span>{mine && session.signedIn && <button className="outline-button" disabled={pending} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>{selecting ? 'Done' : 'Select'}</button>}</div>
      {mine && session.signedIn && selecting && <div className="library-selection"><label><input type="checkbox" checked={allSelected} disabled={pending || !selectable.length} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(g => g.publicId)))} />Select loaded <span>({selected.size}/100)</span></label><button className="library-delete" disabled={pending || !selected.size} onClick={() => void remove([...selected])}>{pending ? 'Removing…' : `Delete selected (${selected.size})`}</button></div>}
      {notice && <div className="library-notice" role="status"><span>{notice}</span>{undo.length > 0 && <button disabled={pending} onClick={() => void restore()}>Undo</button>}</div>}
      {query.isLoading && <LogoLoader compact label="Finding your collections" />}
      {query.error && <p role="alert" className="form-error">{query.error.message} <button onClick={() => void query.refetch()}>Retry</button></p>}
      {!query.isLoading && !query.error && !groups.length && <div className="empty-state"><p>{search ? 'No matching collections in the loaded results.' : mine ? 'Your saved collections will appear here.' : 'No public collections yet.'}</p><Link href="/" className="primary-button mt-4">Generate codes ↗</Link></div>}
      <ul className={`library-cards layout-${layout}`}>{groups.map(group => <li key={group.publicId} className={selected.has(group.publicId) ? 'is-selected' : ''}>
        {mine && session.signedIn && selecting && <label className="library-checkbox"><input type="checkbox" aria-label={`Select ${group.title}`} checked={selected.has(group.publicId)} disabled={pending || (!selected.has(group.publicId) && selected.size >= 100)} onChange={() => toggle(group.publicId)} /></label>}
        <Link href={`/g/${group.publicId}`} className="library-card-link"><div className="library-card-meta"><span>{group.isPublic ? 'Public' : 'Private'}</span><time>{new Date(group.createdAt).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short' })}</time></div><h2>{group.title}</h2><div className="library-card-bottom"><span><b>{group.slipCount}</b> codes</span><span aria-hidden>↗</span></div></Link>
        <div className="library-creator">{group.creator ? <span>{group.creator.name}</span> : <span>Community collection</span>}</div>
        <div className="library-card-action"><span>{group.isOwner ? 'Created by you' : 'Public collection'}</span><CollectionMenu collection={group} onDelete={mine && group.isOwner ? () => remove([group.publicId]) : undefined} onNotice={setNotice} /></div>
      </li>)}</ul>
      {query.hasNextPage && <button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="outline-button library-more">{query.isFetchingNextPage ? 'Loading…' : 'Load more collections'}</button>}
    </>}
  </main>;
}

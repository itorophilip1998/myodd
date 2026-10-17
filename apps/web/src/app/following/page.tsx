'use client';
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, creatorsApi } from '@/lib/api';
import { useAccountSession, SignInPrompt } from '@/components/AccountSession';
import { CreatorCard } from '@/components/CreatorCard';
import { PublicCollectionCard } from '@/components/PublicCollectionCard';
import { LogoLoader } from '@/components/LogoLoader';
export default function FollowingPage() {
  const session = useAccountSession(); const [tab, setTab] = useState<'feed' | 'monitoring' | 'discover'>(session.signedIn ? 'feed' : 'discover');
  const [search, setSearch] = useState(''); const [term, setTerm] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { const timer = setTimeout(() => setTerm(search), 300); return () => clearTimeout(timer); }, [search]);
  const discover = useInfiniteQuery({ queryKey: ['creators', 'discover', term, session.userId], enabled: tab === 'discover', initialPageParam: 1, queryFn: ({ pageParam }) => creatorsApi.discover(term, pageParam), getNextPageParam: (last, pages) => last.length === 50 ? pages.length + 1 : undefined });
  const monitoring = useInfiniteQuery({ queryKey: ['monitoring', session.userId], enabled: session.signedIn && tab === 'monitoring', initialPageParam: 1, queryFn: ({ pageParam }) => creatorsApi.monitoring(pageParam), getNextPageParam: (last, pages) => last.length === 50 ? pages.length + 1 : undefined });
  const feed = useInfiniteQuery({ queryKey: ['following', session.userId], enabled: session.signedIn && tab === 'feed', initialPageParam: 1, queryFn: ({ pageParam }) => api.followingGroups(pageParam), refetchInterval: 30000, getNextPageParam: (last, pages) => last.length === 50 ? pages.length + 1 : undefined });
  const creators = (tab === 'discover' ? discover.data : monitoring.data)?.pages.flat() ?? [];
  const collections = feed.data?.pages.flat() ?? [];
  const current = tab === 'discover' ? discover : tab === 'monitoring' ? monitoring : feed;
  return <main className="workspace following-workspace"><header className="following-hero"><p className="eyebrow">FOLLOW THE PICKS</p><h1>Your people. <em>Their public codes.</em></h1><p>Monitor creators, explore their latest public tickets, and copy collections into your own library.</p></header><div className="history-tabs following-tabs" role="group" aria-label="Creator views">{([{ value: 'feed', label: 'Latest picks' }, { value: 'monitoring', label: 'Monitoring list' }, { value: 'discover', label: 'Discover creators' }] as const).map(t => <button key={t.value} aria-pressed={tab === t.value} onClick={() => { setTab(t.value); setNotice(''); }}>{t.label}</button>)}</div>
    {tab !== 'discover' && !session.signedIn ? <SignInPrompt /> : <>{tab === 'discover' && <label className="library-search creator-search"><span aria-hidden>⌕</span><input type="search" maxLength={64} aria-label="Search creators" placeholder="Find a creator by username…" value={search} onChange={e => setSearch(e.target.value)} /></label>}{notice && <p className="library-notice" role="status">{notice}</p>}{current.isLoading && <LogoLoader compact label={tab === 'feed' ? 'Finding the latest public picks' : 'Finding creators'} />}{current.error && <p role="alert" className="form-error">{current.error.message} <button onClick={() => void current.refetch()}>Retry</button></p>}
    {tab === 'feed' ? <ul className="library-cards layout-compact">{collections.map(g => <PublicCollectionCard key={g.publicId} collection={g} onNotice={setNotice} />)}</ul> : <div className="creator-grid">{creators.map(c => <CreatorCard key={c.publicId} creator={c} />)}</div>}
    {!current.isLoading && !current.error && !(tab === 'feed' ? collections.length : creators.length) && <div className="empty-state"><p>{tab === 'feed' ? 'No public picks from your monitored creators yet.' : tab === 'monitoring' ? 'Your monitoring list is empty.' : 'No matching creators with public collections yet. Publish a collection to make your own creator profile discoverable.'}</p>{tab !== 'discover' && <button className="outline-button" onClick={() => setTab('discover')}>Discover creators ↗</button>}</div>}
    {current.hasNextPage && <button className="outline-button library-more" disabled={current.isFetchingNextPage} onClick={() => void current.fetchNextPage()}>{current.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>}</>}
    <p className="following-note">This feed shows public picks shared in myOdd. Following does not reveal private collections, placed bets, stakes, or betting results.</p>
  </main>;
}

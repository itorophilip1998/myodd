'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, creatorsApi } from '@/lib/api';
import { useAccountSession } from '@/components/AccountSession';
import { FollowCreatorButton } from '@/components/CreatorCard';
import { PublicCollectionCard } from '@/components/PublicCollectionCard';
import { LogoLoader } from '@/components/LogoLoader';
export default function CreatorPage() {
  const { id } = useParams<{ id: string }>(); const session = useAccountSession(); const [notice, setNotice] = useState('');
  const profile = useQuery({ queryKey: ['creators', id, session.userId], queryFn: () => creatorsApi.profile(id) });
  const codes = useInfiniteQuery({ queryKey: ['history', 'creator', id, session.userId], initialPageParam: 1, queryFn: ({ pageParam }) => api.publicGroups(pageParam, id), refetchInterval: 30000, getNextPageParam: (last, pages) => last.length === 50 ? pages.length + 1 : undefined });
  if (profile.isLoading) return <main className="workspace"><LogoLoader label="Opening this creator’s public picks" /></main>;
  if (profile.error || !profile.data) return <main className="workspace"><p role="alert">{profile.error?.message ?? 'Creator not found'}</p></main>;
  const creator = profile.data; const collections = codes.data?.pages.flat() ?? [];
  return <main className="workspace following-workspace"><Link href="/following" className="creator-back">← All creators</Link><header className="creator-profile-header"><span className="creator-avatar" aria-hidden>{(creator.username ?? creator.name).replace('@', '').slice(0, 2).toUpperCase()}</span><div><p className="eyebrow">PUBLIC CREATOR PROFILE</p><h1>{creator.name}</h1><p>{creator.publicCollections} public collections · {creator.followerCount} followers</p></div><FollowCreatorButton creator={creator} /></header><div className="creator-codes-heading"><h2>All public codes</h2><span>{collections.length} loaded</span></div>{notice && <p className="library-notice" role="status">{notice}</p>}{codes.isLoading && <LogoLoader compact label="Loading public collections" />}{codes.error && <p role="alert" className="form-error">{codes.error.message}</p>}<ul className="library-cards layout-compact">{collections.map(g => <PublicCollectionCard key={g.publicId} collection={g} onNotice={setNotice} />)}</ul>{!codes.isLoading && !collections.length && <p className="empty-state">No public collections to display.</p>}{codes.hasNextPage && <button className="outline-button library-more" disabled={codes.isFetchingNextPage} onClick={() => void codes.fetchNextPage()}>Load more collections</button>}</main>;
}

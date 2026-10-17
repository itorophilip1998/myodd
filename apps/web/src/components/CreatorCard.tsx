'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { creatorsApi, type CreatorSummary } from '@/lib/api';
import { useAccountSession } from './AccountSession';
export function FollowCreatorButton({ creator }: { creator: CreatorSummary }) {
  const session = useAccountSession(); const query = useQueryClient(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function toggle() { setBusy(true); setError(''); try { if (creator.following) await creatorsApi.unfollow(creator.publicId); else await creatorsApi.follow(creator.publicId); await Promise.all(['creators', 'monitoring', 'following', 'history'].map(key => query.invalidateQueries({ queryKey: [key] }))); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (creator.isSelf) return <span className="creator-self">Your public profile</span>;
  return <div className="creator-follow-control">{session.signedIn ? <button className={creator.following ? 'outline-button' : 'primary-button'} disabled={busy} onClick={() => void toggle()}>{busy ? 'Updating…' : creator.following ? '✓ Monitoring · Unfollow' : '◎ Add to monitoring'}</button> : <Link className="outline-button" href="/sign-in">Sign in to follow</Link>}{error && <p role="alert">{error}</p>}</div>;
}
export function CreatorCard({ creator }: { creator: CreatorSummary }) {
  return <article className="creator-card"><Link href={`/creators/${creator.publicId}`} className="creator-card-heading"><span className="creator-avatar" aria-hidden>{(creator.username ?? creator.name).replace('@', '').slice(0, 2).toUpperCase()}</span><div><h2>{creator.name}</h2><p>{creator.publicCollections ?? 0} public collections · {creator.followerCount ?? 0} followers</p></div><span aria-hidden>↗</span></Link><FollowCreatorButton creator={creator} /><Link className="creator-view" href={`/creators/${creator.publicId}`}>View all public codes ↗</Link></article>;
}

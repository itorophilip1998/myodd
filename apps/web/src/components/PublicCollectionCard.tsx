'use client';
import Link from 'next/link';
import { CollectionMenu } from './CollectionMenu';
import type { CollectionSummary } from '@/lib/api';
export function PublicCollectionCard({ collection, onNotice }: { collection: CollectionSummary; onNotice?: (message: string) => void }) {
  return <li><Link className="library-card-link" href={`/g/${collection.publicId}`}><div className="library-card-meta"><span>Public</span><time>{new Date(collection.createdAt).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short' })}</time></div><h2>{collection.title}</h2><div className="library-card-bottom"><span><b>{collection.slipCount}</b> codes</span><span aria-hidden>↗</span></div></Link>{collection.creator && <div className="library-creator"><Link href={`/creators/${collection.creator.publicId}`}>{collection.creator.name}</Link></div>}<div className="library-card-action"><span>{collection.saved ? '✓ In My collections' : 'View / copy picks'}</span><CollectionMenu collection={collection} onNotice={onNotice} /></div></li>;
}

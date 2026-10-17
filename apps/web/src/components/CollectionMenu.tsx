'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, accountApi, type CollectionSummary } from '@/lib/api';
type MenuCollection = Pick<CollectionSummary, 'publicId' | 'title' | 'isPublic' | 'isOwner' | 'creator'>;
export function CollectionMenu({ collection, onDelete, onNotice }: { collection: MenuCollection; onDelete?: () => Promise<void | boolean>; onNotice?: (message: string) => void }) {
  const router = useRouter(); const query = useQueryClient(); const box = useRef<HTMLDetailsElement>(null);
  const [pending, setPending] = useState(false); const [renaming, setRenaming] = useState(false); const [title, setTitle] = useState(collection.title); const [error, setError] = useState('');
  useEffect(() => { function close(e: PointerEvent) { if (!box.current?.contains(e.target as Node)) box.current?.removeAttribute('open'); } function escape(e: KeyboardEvent) { if (e.key === 'Escape') { box.current?.removeAttribute('open'); setRenaming(false); } } document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape); return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); }; }, []);
  async function action(work: () => Promise<unknown>, message: string) {
    setPending(true); setError('');
    try { await work(); await Promise.all(['history', 'group'].map(key => query.invalidateQueries({ queryKey: [key] }))); onNotice?.(message); box.current?.removeAttribute('open'); setRenaming(false); }
    catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  if (!collection.isOwner) {
    return <details className="collection-menu" ref={box}><summary aria-label={`Actions for ${collection.title}`} title="Collection actions"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg></summary><div className="collection-menu-panel" role="group" aria-label="Collection actions"><Link href={`/g/${collection.publicId}`}><span aria-hidden>↗</span>View tickets</Link></div></details>;
  }
  return <details className="collection-menu" ref={box}><summary aria-label={`Actions for ${collection.title}`} title="Collection actions"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg></summary><div className="collection-menu-panel" role="group" aria-label="Collection actions">
    {renaming ? <form onSubmit={e => { e.preventDefault(); void action(() => api.editGroup(collection.publicId, { title: title.trim() }), 'Collection renamed.'); }}><label>Collection name<input aria-label="Collection name" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} autoFocus /></label><button disabled={pending || !title.trim()} type="submit">✓ Save name</button><button type="button" onClick={() => setRenaming(false)}>Cancel</button></form> : <><Link href={`/g/${collection.publicId}?edit=1`}><span aria-hidden>✎</span>Edit tickets</Link><button disabled={pending} onClick={() => { setTitle(collection.title); setRenaming(true); }}><span aria-hidden>✎</span>Rename collection</button><button disabled={pending} onClick={() => void action(() => api.editGroup(collection.publicId, { isPublic: !collection.isPublic }), collection.isPublic ? 'Collection is now private.' : 'Collection is now public.')}><span aria-hidden>{collection.isPublic ? '▣' : '↗'}</span>{collection.isPublic ? 'Make private' : 'Make public'}</button><button className="menu-danger" disabled={pending} onClick={() => void action(async () => { if (onDelete) { if (await onDelete() === false) throw new Error('Could not delete this collection. Please retry.'); } else { await accountApi.remove([collection.publicId]); router.push('/history'); } }, 'Collection deleted.')}><span aria-hidden>⌫</span>Delete collection</button></>}
    {pending && <p role="status">Updating…</p>}{error && <p role="alert">{error}</p>}
  </div></details>;
}

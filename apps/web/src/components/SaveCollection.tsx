'use client';
import { track } from '@/lib/analytics';
import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useAccountSession } from './AccountSession';
import { accountApi } from '@/lib/api';
import { useToast } from './ToastProvider';

export function SaveCollection({ publicId, title: initialTitle = 'My Football Picks', saved, userSaved, isOwner, isPublic, autoPrompt = false }: {
  publicId: string; title?: string; saved?: boolean; userSaved?: boolean; isOwner?: boolean; isPublic?: boolean; autoPrompt?: boolean;
}) {
  const account = useAccountSession(); const query = useQueryClient(); const toast = useToast();
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [title, setTitle] = useState(initialTitle); const [publish, setPublish] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const id = useId(); const prompted = useRef(false);
  const draftKey = `myodd-save-draft:${publicId}`;
  useEffect(() => {
    try { const raw = sessionStorage.getItem(draftKey); if (raw) { const draft = JSON.parse(raw); setTitle(typeof draft.title === 'string' ? draft.title : initialTitle); setPublish(draft.isPublic === true); setOpen(true); } } catch {}
  }, [draftKey, initialTitle]);
  useEffect(() => {
    if (!autoPrompt || saved || userSaved || prompted.current) return;
    prompted.current = true;
    try { if (sessionStorage.getItem(`myodd-save-prompt:${publicId}`)) return; } catch {}
    setOpen(true);
  }, [autoPrompt, saved, userSaved, publicId]);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current.close(); }, [open]);
  function dismiss() { if (saving) return; setOpen(false); try { sessionStorage.removeItem(draftKey); sessionStorage.setItem(`myodd-save-prompt:${publicId}`, 'answered'); } catch {} }
  async function save() {
    setSaving(true); setError('');
    try {
      await accountApi.save(publicId, { title: title.trim(), isPublic: publish });
      track('collection_saved'); if (publish && !isPublic) track('collection_published');
      setOpen(false); try { sessionStorage.removeItem(draftKey); } catch {}
      await Promise.all([query.invalidateQueries({ queryKey: ['group', publicId] }), query.invalidateQueries({ queryKey: ['history'] }), query.invalidateQueries({ queryKey: ['public-collections'] })]);
      toast(publish ? 'Collection saved and published' : 'Collection saved privately');
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  if (!account.configured || ((saved || userSaved) && !isOwner)) return null;
  return <>
    <button type="button" className="outline-button" onClick={() => { setPublish(isPublic === true); setOpen(true); }}>{saved || userSaved ? 'Organize collection' : 'Save Collection'}</button>
    <dialog ref={dialog} className="collection-choice-dialog" aria-labelledby={id} onCancel={e => { e.preventDefault(); dismiss(); }} onClick={e => { if (e.target === e.currentTarget) dismiss(); }}>
      <form className="collection-choice-content" onSubmit={e => { e.preventDefault(); void save(); }}>
        <h2 id={id}>Save Collection</h2>
        <label>Collection title<input autoFocus required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="settings-switch"><input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} />Make this collection public</label>
        <p>Private unless you choose Public. All collections are deleted 24 hours after every match has a confirmed final result.</p>
        {error && <p role="alert">{error}</p>}
        <div className="collection-choice-actions"><button type="button" className="outline-button" disabled={saving} onClick={dismiss}>Cancel</button>
          {account.signedIn ? <button className="primary-button" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save Collection'}</button>
            : <Link className="primary-button" href={`/sign-in?redirect_url=${encodeURIComponent(`/g/${publicId}`)}`} onClick={() => { try { sessionStorage.setItem(draftKey, JSON.stringify({ title, isPublic: publish })); } catch {} }}>Sign in to save</Link>}
        </div>
      </form>
    </dialog>
  </>;
}

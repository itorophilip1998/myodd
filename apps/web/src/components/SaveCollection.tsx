'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useAccountSession } from './AccountSession';
import { accountApi, api } from '@/lib/api';
import { useToast } from './ToastProvider';

export function SaveCollection({ publicId, saved, userSaved, isOwner, isPublic, autoPrompt = false }: {
  publicId: string;
  saved?: boolean;
  userSaved?: boolean;
  isOwner?: boolean;
  isPublic?: boolean;
  autoPrompt?: boolean;
}) {
  const account = useAccountSession();
  const query = useQueryClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'save' | 'public' | null>(null);
  const [error, setError] = useState('');
  const [savedHere, setSavedHere] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const prompted = useRef(false);
  const titleId = useId();
  const bodyId = useId();
  const promptKey = `myodd-save-prompt:${publicId}`;
  const kept = !!(saved || userSaved || savedHere);

  function rememberChoice() {
    try { sessionStorage.setItem(promptKey, 'answered'); } catch {}
  }
  function dismiss() {
    if (saving) return;
    rememberChoice();
    setStep(null);
    setError('');
  }
  useEffect(() => {
    if (!autoPrompt || kept || prompted.current || !account.configured) return;
    prompted.current = true;
    try { if (sessionStorage.getItem(promptKey)) return; } catch {}
    setStep('save');
  }, [autoPrompt, kept, account.configured, promptKey]);
  useEffect(() => {
    if (step && !dialog.current?.open) dialog.current?.showModal();
    if (!step && dialog.current?.open) dialog.current.close();
    if (step) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [step]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await accountApi.save(publicId);
      setSavedHere(true);
      rememberChoice();
      setStep(isPublic ? null : 'public');
      await query.invalidateQueries({ queryKey: ['group', publicId] });
      await query.invalidateQueries({ queryKey: ['history'] });
      toast('Collection saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function publish() {
    setSaving(true);
    setError('');
    try {
      await api.editGroup(publicId, { isPublic: true });
      setStep(null);
      await query.invalidateQueries({ queryKey: ['group', publicId] });
      await query.invalidateQueries({ queryKey: ['history'] });
      toast('Collection is now public');
    } catch (e) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  }
  if (!account.configured) return null;
  return <>
    {kept
      ? <span className="collection-saved-pill">Saved{(isOwner || savedHere) && !isPublic ? ' · private' : ''}</span>
      : <button type="button" className="outline-button" disabled={saving} onClick={() => { setError(''); setStep('save'); }}>Save</button>}
    <dialog ref={dialog} className="collection-choice-dialog" aria-labelledby={titleId} aria-describedby={bodyId}
      onCancel={e => { e.preventDefault(); dismiss(); }} onClick={e => { if (e.target === e.currentTarget) dismiss(); }}>
      <div key={step} className="collection-choice-content">
        <span className="collection-choice-icon" aria-hidden>{step === 'public' ? '↗' : '◇'}</span>
        <p className="eyebrow">{step === 'public' ? 'SAVED PRIVATELY' : 'YOUR TICKETS ARE READY'}</p>
        <h2 id={titleId}>{step === 'public' ? 'Make this collection public?' : 'Save this collection?'}</h2>
        <p id={bodyId}>{step === 'public'
          ? 'Let others find these tickets in Public codes. Your creator name and the collection’s tickets will be visible. You can make it private again later.'
          : 'Keep these tickets in Saved codes so you can find and check them later. Saving keeps them private until you choose to make them public.'}</p>
        {error && <p className="collection-choice-error" role="alert">{error}</p>}
        <div className="collection-choice-actions">
          <button type="button" className="outline-button" disabled={saving} onClick={dismiss}>{step === 'public' ? 'Keep private' : 'Not now'}</button>
          {step === 'save' && !account.signedIn
            ? <Link className="primary-button" href={`/sign-in?redirect_url=${encodeURIComponent(`/g/${publicId}`)}`}>Sign in to save</Link>
            : <button type="button" className="primary-button" disabled={saving} onClick={() => void (step === 'public' ? publish() : save())}>
                {saving ? step === 'public' ? 'Publishing…' : 'Saving…' : step === 'public' ? 'Make public' : 'Save privately'}
              </button>}
        </div>
      </div>
    </dialog>
  </>;
}

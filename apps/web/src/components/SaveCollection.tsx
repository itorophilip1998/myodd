'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useAccountSession } from './AccountSession';
import { accountApi } from '@/lib/api';

export function SaveCollection({ publicId, saved, userSaved, isOwner, isPublic }: {
  publicId: string;
  saved?: boolean;
  userSaved?: boolean;
  isOwner?: boolean;
  isPublic?: boolean;
}) {
  const account = useAccountSession();
  const query = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const kept = !!(saved || userSaved);
  async function save() {
    setSaving(true);
    setError('');
    try {
      await accountApi.save(publicId);
      await query.invalidateQueries({ queryKey: ['group', publicId] });
      await query.invalidateQueries({ queryKey: ['history'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!account.signedIn) {
    return account.configured ? <Link className="outline-button" href="/sign-in">Sign in to save</Link> : null;
  }
  return <>
    {kept
      ? <span className="collection-saved-pill">Saved{isOwner && !isPublic ? ' · private' : ''}</span>
      : <button className="outline-button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </>;
}

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
  return <div className="collection-account-save">
    {account.signedIn ? <>
      {kept
        ? <span>✓ Saved to your account{isOwner && !isPublic ? ' · private until you share' : ''}</span>
        : <button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : '＋ Save this collection'}</button>}
      {!kept && <p className="collection-save-hint">Results stay on this page until you save them to your library.</p>}
    </> : account.configured
      ? <Link href="/sign-in">Sign in to save this collection to your library ↗</Link>
      : <p className="collection-save-hint">Keep this page open or bookmark it. Saving to a library needs sign-in.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

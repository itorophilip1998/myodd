'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useAccountSession } from './AccountSession';
import { accountApi } from '@/lib/api';
export function SaveCollection({ publicId, saved, isOwner, isPublic }: { publicId: string; saved?: boolean; isOwner?: boolean; isPublic?: boolean }) {
  const account = useAccountSession(); const query = useQueryClient(); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  async function save() { setSaving(true); try { await accountApi.save(publicId); await query.invalidateQueries({ queryKey: ['group', publicId] }); await query.invalidateQueries({ queryKey: ['history'] }); } catch (e) { setError((e as Error).message); } finally { setSaving(false); } }
  return <div className="collection-account-save">{account.signedIn ? <>{saved ? <span>✓ Saved to your account{isOwner && !isPublic ? ' · private until you share' : ''}</span> : <button disabled={saving} onClick={save}>{saving ? 'Saving…' : '＋ Save to my account'}</button>}</> : account.configured ? <Link href="/sign-in">Sign in to keep this collection across devices ↗</Link> : null}{error && <p role="alert">{error}</p>}</div>;
}

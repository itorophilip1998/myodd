'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from './ToastProvider';

export function VerifiedBookmakerLink({ code, url, onUnavailable }: { code: string; url: string; onUnavailable?: () => void }) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  async function open() {
    setChecking(true);
    const target = window.open('about:blank', '_blank');
    if (target) target.opener = null;
    try {
      const checked = await api.verifyCode(code);
      if (!checked.codes.includes(code)) {
        target?.close();
        toast('This code is no longer available.', { sticky: true });
        onUnavailable?.();
        return;
      }
      if (target) target.location.href = url;
      else window.location.assign(url);
    } catch {
      target?.close();
      toast('Could not verify this code. Try again.', { sticky: true });
    } finally {
      setChecking(false);
    }
  }
  return (
    <button type="button" className="sporty-link" disabled={checking} onClick={open}>
      {checking ? 'Checking…' : 'Open in SportyBet ↗'}
    </button>
  );
}

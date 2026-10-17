'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
export function VerifiedBookmakerLink({ code, url, onUnavailable }: { code: string; url: string; onUnavailable?: () => void }) {
  const [checking, setChecking] = useState(false); const [error, setError] = useState('');
  async function open() {
    setChecking(true); setError('');
    const target = window.open('about:blank', '_blank'); if (target) target.opener = null;
    try { const checked = await api.verifyCode(code); if (!checked.codes.includes(code)) { target?.close(); setError('This code is no longer available.'); onUnavailable?.(); return; }
      if (target) target.location.href = url; else window.location.assign(url);
    } catch { target?.close(); setError('Could not verify this code. Try again.'); } finally { setChecking(false); }
  }
  return <><button type="button" className="sporty-link" disabled={checking} onClick={open}>{checking ? 'Checking…' : 'Open in SportyBet ↗'}</button>{error && <p role="status" className="form-error">{error}</p>}</>;
}

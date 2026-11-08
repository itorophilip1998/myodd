'use client';
import { track } from '@/lib/analytics';
import { formatOdds } from '@myodd/shared';
import { useState } from 'react';
import { api } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { useToast } from './ToastProvider';

export function ShareButtons({ code, selectionCount, totalOdds, shareUrl, groupUrl, expired = false, onUnavailable }: { code: string; selectionCount: number; totalOdds: number; shareUrl: string; groupUrl?: string; expired?: boolean; onUnavailable?: () => void }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const text = `${code} · ${selectionCount} picks · ${formatOdds(totalOdds)} odds`;
  async function verify() {
    setChecking(true);
    try {
      const checked = await api.verifyCode(code);
      if (!checked.codes.includes(code)) {
        toast('This code is no longer available', { sticky: true });
        onUnavailable?.();
        return false;
      }
      return true;
    } catch {
      toast('Could not verify this code. Try again.', { sticky: true });
      return false;
    } finally {
      setChecking(false);
    }
  }
  async function copy() {
    if (!await verify()) return;
    try {
      await copyText(code);
      track('code_copied');
      setCopied(true);
      toast('Copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Select the code to copy', { sticky: true });
    }
  }
  async function share() {
    if (!await verify()) return;
    track('share_clicked');
    if (navigator.share) {
      try {
        await navigator.share({ title: `SportyBet ${code}`, text, url: shareUrl });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setOpen(true);
      }
    } else setOpen(!open);
  }
  return (
    <div className="code-actions">
      <button onClick={copy} disabled={expired || checking} type="button" className="copy-button">
        {checking ? 'Checking…' : copied ? '✓ Copied' : 'Copy code'}
      </button>
      <button onClick={share} disabled={expired || checking} type="button" className="quiet-button">Share ↗</button>
      {open && (
        <div className="share-menu">
          <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>
          <a href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Telegram ↗</a>
          <button onClick={async () => {
            try {
              await copyText(groupUrl ?? shareUrl);
              toast('Link copied');
            } catch {
              toast('Could not copy link', { sticky: true });
            }
          }}>Copy link</button>
        </div>
      )}
    </div>
  );
}

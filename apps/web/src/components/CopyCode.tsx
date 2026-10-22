'use client';
import { track } from '@/lib/analytics';
import { useRef } from 'react';
import { copyText } from '@/lib/clipboard';
import { useToast } from './ToastProvider';

export function CopyCode({ code, className = 'booking-code' }: { code: string; className?: string }) {
  const toast = useToast();
  const text = useRef<HTMLSpanElement>(null);
  return <button type="button" className={`copy-code ${className}`} aria-label={`Copy code ${code}`} onClick={async event => {
    event.stopPropagation();
    try { await copyText(code); track('code_copied'); toast('Code copied!'); }
    catch {
      const selection = window.getSelection();
      if (text.current && selection) { const range = document.createRange(); range.selectNodeContents(text.current); selection.removeAllRanges(); selection.addRange(range); }
      toast('Select the code to copy it.', { sticky: true });
    }
  }}><span ref={text}>{code}</span><span className="copy-code-icon" aria-hidden>⧉</span></button>;
}

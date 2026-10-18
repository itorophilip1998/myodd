'use client';

import { useEffect, useRef } from 'react';
import { useToast } from './ToastProvider';

const SEEN_KEY = 'myodd-job-notices-seen';

function readSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    const seen = readSeen();
    seen.add(id);
    const list = [...seen].slice(-80);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Toast a job notice once, then never show it again for that job. */
export function JobNoticeToast({
  noticeKey,
  message,
  sticky = false,
}: {
  noticeKey?: string | null;
  message?: string | null;
  sticky?: boolean;
}) {
  const toast = useToast();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    const key = noticeKey?.trim();
    const text = message?.trim();
    if (!key || !text) return;
    if (readSeen().has(key)) return;
    shown.current = true;
    markSeen(key);
    toast(text, sticky ? { sticky: true } : undefined);
  }, [noticeKey, message, sticky, toast]);

  return null;
}

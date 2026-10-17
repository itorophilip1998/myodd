'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
export function LearningFeedback({ publicId }: { publicId: string }) {
  const [open, setOpen] = useState(false); const [note, setNote] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(false);
  async function send(rating: 'helpful' | 'needs_work', rememberSettings = false) {
    setLoading(true);
    try { const result = await api.feedback({ groupId: publicId, rating, note: note || undefined, correctedPrompt: rating === 'needs_work' ? note || undefined : undefined, rememberSettings }); setStatus(result.remembered ? 'Saved. Your next request can start with these defaults.' : 'Feedback saved to help improve future versions.'); setOpen(false); }
    catch (err) { setStatus((err as Error).message); } finally { setLoading(false); }
  }
  return <section className="learning-feedback"><div><strong>Make myOdd more yours</strong><p>Remember your mode and ticket/game counts, or tell us what to improve.</p></div><div className="feedback-actions"><button disabled={loading} onClick={() => send('helpful', true)}>Remember these settings ✧</button><button disabled={loading} onClick={() => setOpen(!open)}>Something to improve?</button></div>{open && <div className="feedback-note"><label>What should change?<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder="e.g. I wanted three games on each ticket, not three tickets." /></label><button disabled={loading || !note.trim()} onClick={() => send('needs_work')}>Save feedback</button></div>}{status && <p role="status" className="action-status">{status}</p>}</section>;
}

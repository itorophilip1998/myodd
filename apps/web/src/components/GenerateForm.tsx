'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function GenerateForm() {
  const router = useRouter();
  const [bookingCode, setBookingCode] = useState('');
  const [instruction, setInstruction] = useState(
    'Create 10 lower variance slips between 3 and 5 odds. Prefer over 1.5 and double chance.',
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const code = bookingCode.trim();
      const res = await api.generate({
        bookingCode: code || undefined,
        instruction: instruction.trim(),
      });
      router.push(`/result/${res.publicId}?job=${res.jobId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-xl mx-auto space-y-6">
      <label className="block space-y-2 animate-rise-delay">
        <span className="text-sm uppercase tracking-[0.2em] text-lime/80">
          Paste SportyBet code
        </span>
        <input
          value={bookingCode}
          onChange={(e) => setBookingCode(e.target.value.toUpperCase())}
          placeholder="THUMU4"
          className="w-full bg-transparent border-b border-lime/40 px-1 py-3 text-2xl font-display tracking-widest outline-none focus:border-lime placeholder:text-sand/30"
          maxLength={32}
          autoComplete="off"
        />
      </label>

      <p className="text-center text-sand/40 text-sm tracking-[0.3em] uppercase animate-rise-delay">
        or
      </p>

      <label className="block space-y-2 animate-rise-late">
        <span className="text-sm uppercase tracking-[0.2em] text-lime/80">
          Describe what you want
        </span>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={4}
          required
          className="w-full bg-white/5 border border-white/10 px-4 py-3 text-base outline-none focus:border-lime/50 resize-y min-h-[120px]"
        />
      </label>

      {error && (
        <p className="text-ember text-sm" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !instruction.trim()}
        className="w-full bg-lime text-ink font-semibold py-4 text-lg tracking-wide hover:bg-[#c8ec97] transition disabled:opacity-50 animate-rise-late"
      >
        {loading ? 'Generating…' : 'Generate slips'}
      </button>
    </form>
  );
}

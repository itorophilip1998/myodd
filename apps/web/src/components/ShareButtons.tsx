'use client';

import { buildShareMessage } from '@myodd/shared';

export function ShareButtons({
  code,
  selectionCount,
  totalOdds,
  shareUrl,
  groupUrl,
}: {
  code: string;
  selectionCount: number;
  totalOdds: number;
  shareUrl: string;
  groupUrl?: string;
}) {
  const text = buildShareMessage({ code, selectionCount, totalOdds });
  const encoded = encodeURIComponent(text);
  const url = encodeURIComponent(groupUrl ?? shareUrl);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <button
        type="button"
        onClick={() => copy(code)}
        className="rounded-md border border-lime/30 px-3 py-1.5 text-lime hover:bg-lime/10 transition"
      >
        Copy code
      </button>
      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-sand/20 px-3 py-1.5 hover:bg-white/5 transition"
      >
        Open SportyBet
      </a>
      <a
        href={`https://wa.me/?text=${encoded}%20${url}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-sand/20 px-3 py-1.5 hover:bg-white/5 transition"
      >
        WhatsApp
      </a>
      <a
        href={`https://t.me/share/url?url=${url}&text=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-sand/20 px-3 py-1.5 hover:bg-white/5 transition"
      >
        Telegram
      </a>
      <a
        href={`https://twitter.com/intent/tweet?text=${encoded}&url=${url}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-sand/20 px-3 py-1.5 hover:bg-white/5 transition"
      >
        X
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${url}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-sand/20 px-3 py-1.5 hover:bg-white/5 transition"
      >
        Facebook
      </a>
      <button
        type="button"
        onClick={() => copy(groupUrl ?? shareUrl)}
        className="rounded-md border border-sand/20 px-3 py-1.5 hover:bg-white/5 transition"
      >
        Copy link
      </button>
    </div>
  );
}

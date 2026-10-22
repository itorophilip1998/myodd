import { cache } from 'react';
export function siteUrl() {
  try { return new URL(process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'); } catch { return new URL('http://localhost:3000'); }
}
export const publicCollection = cache(async (id: string): Promise<{ title: string; publicId: string; createdAt: string } | null> => {
  try {
    const base = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001';
    const response = await fetch(`${base}/api/groups/${encodeURIComponent(id)}/public-metadata`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.title === 'string' && typeof data.publicId === 'string' ? data : null;
  } catch { return null; }
});

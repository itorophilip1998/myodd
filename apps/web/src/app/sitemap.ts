import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/public-seo';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = ['/', '/generate', '/live', '/predictions', '/terms', '/privacy'].map(path => ({ url: new URL(path, base).href }));
  try {
    const response = await fetch(`${process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001'}/api/groups/sitemap`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const rows = await response.json() as Array<{ publicId: string; createdAt: string }>;
      for (const row of rows) if (/^[a-zA-Z0-9_-]+$/.test(row.publicId)) pages.push({ url: new URL(`/g/${row.publicId}`, base).href, lastModified: row.createdAt });
    }
  } catch { /* Public landing pages remain discoverable while the API recovers. */ }
  return pages;
}

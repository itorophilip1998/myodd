import type { Metadata } from 'next';
import { cache } from 'react';

export const PUBLIC_ROUTES = ['/', '/about', '/faq', '/terms', '/privacy'] as const;
export const HOME_TITLE = 'MyOdd — Football Booking Code Generator & Betting Tools';
export const HOME_DESCRIPTION = 'Generate, organize, and share football booking codes with MyOdd. Explore betting markets, manage your selections, and check match results in one place.';
export const GOOGLE_VERIFICATION = 'c315TbfKdqoaKm_ZCFVUj_UGicyj8QmWpGurIdRyVzM';
export function siteUrl() {
  const fallback = process.env.NODE_ENV === 'production' ? 'https://myodd.org' : 'http://localhost:3000';
  const url = new URL(process.env.PUBLIC_WEB_URL || fallback);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('PUBLIC_WEB_URL must be an HTTP(S) origin');
  return new URL(url.origin);
}
export function publicMetadata(path: string, title: string, description: string): Metadata {
  const url = new URL(path, siteUrl()).href;
  return {
    title, description, alternates: { canonical: url }, robots: { index: true, follow: true },
    openGraph: { type: 'website', siteName: 'MyOdd', locale: 'en_US', title, description, url, images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'MyOdd football booking code tools' }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/opengraph-image'] },
  };
}
export const publicCollection = cache(async (id: string): Promise<{ title: string; publicId: string; createdAt: string } | null> => {
  const base = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001';
  const response = await fetch(`${base}/api/groups/${encodeURIComponent(id)}/public-metadata`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Collection metadata is temporarily unavailable');
  const data = await response.json();
  if (typeof data.title !== 'string' || typeof data.publicId !== 'string') throw new Error('Invalid collection metadata');
  return data;
});

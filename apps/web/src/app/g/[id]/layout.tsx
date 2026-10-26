import type { Metadata } from 'next';
import { publicCollection, siteUrl } from '@/lib/public-seo';
import { auth } from '@clerk/nextjs/server';
import { clerkRuntimeConfig } from '@/lib/clerk-config';
import { notFound } from 'next/navigation';
import { cache } from 'react';

const readCollection = cache(async (id: string) => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) notFound();
  const collection = await publicCollection(id);
  if (collection) return collection;
  // Public metadata deliberately hides private collections. Preserve access for
  // an authenticated owner and for existing unowned drafts using the API policy.
  const token = clerkRuntimeConfig().configured ? await (await auth()).getToken() : null;
  const response = await fetch(`${process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001'}/api/groups/${encodeURIComponent(id)}`, {
    cache: 'no-store', signal: AbortSignal.timeout(5000), headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if ([401, 403, 404, 410].includes(response.status)) notFound();
  if (!response.ok) throw new Error('Collection is temporarily unavailable');
  return null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const collection = await readCollection(id);
  if (!collection) return { title: 'Collection · myOdd', alternates: { canonical: null }, robots: { index: false, follow: false } };
  const title = `${collection.title} · myOdd`;
  const description = 'Public football booking collection. Selections are not guaranteed to win. 18+ | Gamble responsibly.';
  const url = new URL(`/g/${encodeURIComponent(collection.publicId)}`, siteUrl()).href;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, images: ['/opengraph-image'] }, twitter: { card: 'summary_large_image', title, description, images: ['/opengraph-image'] }, robots: { index: false, follow: true } };
}
export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await readCollection((await params).id);
  return <>{children}</>;
}

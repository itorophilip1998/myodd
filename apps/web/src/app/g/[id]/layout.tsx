import type { Metadata } from 'next';
import { publicCollection, siteUrl } from '@/lib/public-seo';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const collection = await publicCollection(id);
  if (!collection) return { title: 'Collection · myOdd', robots: { index: false, follow: false } };
  const title = `${collection.title} · myOdd`;
  const description = 'Public football booking collection. Selections are not guaranteed to win. 18+ | Gamble responsibly.';
  const url = new URL(`/g/${encodeURIComponent(collection.publicId)}`, siteUrl()).href;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, images: ['/icon.png'] }, twitter: { card: 'summary', title, description }, robots: { index: true, follow: true } };
}
export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const collection = await publicCollection((await params).id);
  return <>{collection && <header className="workspace public-collection-heading"><h1>{collection.title}</h1><p>Public football collection · 18+ · Gamble responsibly</p></header>}{children}</>;
}

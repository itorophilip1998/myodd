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
export default function GroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

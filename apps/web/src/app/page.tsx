import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'myOdd — football booking codes', alternates: { canonical: '/' } };
import Link from 'next/link';
import { PublicPreview } from '@/components/PublicPreview';

export default function HomePage() {
  return <main className="home-workspace">
    <div className="hero"><p className="eyebrow">SPORTYBET BOOKING CODES</p>
      <h1>Your next code.<br /><span>Your way.</span></h1>
      <p>Describe your football selections, create booking codes, and manage your collections.</p>
      <Link className="primary-button" href="/generate">Generate codes</Link>
    </div>
    <PublicPreview />
  </main>;
}

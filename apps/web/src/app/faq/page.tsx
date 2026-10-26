import Link from 'next/link';
import { FaqAnswers } from '@/components/SeoContent';
import { publicMetadata } from '@/lib/public-seo';
export const metadata = publicMetadata('/faq', 'MyOdd FAQ — Codes, Collections & Results', 'Answers about MyOdd football booking codes, available markets, private and public collections, result checks, and responsible gambling.');
export default function FaqPage() {
  return <main className="workspace seo-content"><h1>MyOdd frequently asked questions</h1><h2>Using football booking codes and collections</h2><FaqAnswers /><p><Link href="/">Open MyOdd</Link> · <Link href="/about">About MyOdd</Link></p></main>;
}

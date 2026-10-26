import Link from 'next/link';
import { publicMetadata } from '@/lib/public-seo';

export const metadata = publicMetadata('/about', 'About MyOdd — Football Booking Code Tools', 'Learn how MyOdd helps you generate SportyBet football booking codes, organize collections, and check available results.');
export default function AboutPage() {
  return <main className="workspace seo-content"><h1>About MyOdd</h1>
    <h2>Tools for football selections</h2><p>MyOdd helps you turn a SportyBet booking code or written instructions into football booking codes. You can choose available markets, review generated selections, and organize your codes in collections.</p>
    <h2>Save, share, and review</h2><p>Account holders can save collections privately and choose when to publish them. Public collections are accessible by link. Result checks show available match updates, including pending or unknown outcomes when confirmation is unavailable.</p>
    <h2>Understand the limits</h2><p>MyOdd is not a bookmaker and does not accept wagers. Predictions, odds, and match data do not guarantee outcomes. Availability depends on the provider. Collections are temporary and eligible for deletion after all matches are confirmed final and the retention window has passed.</p>
    <p>18+ only. Gamble responsibly and follow local requirements.</p>
    <p><Link href="/">Generate football booking codes</Link> · <Link href="/faq">Read frequently asked questions</Link> · <Link href="/privacy">Privacy policy</Link></p>
  </main>;
}

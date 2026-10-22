import { formatAppVersion } from '@myodd/shared';
import Link from 'next/link';

export function ResponsibleFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-meta">© 2026 myOdd · 18+ · Gamble responsibly</p>
      <span id="app-version" className="footer-version">{formatAppVersion(process.env.NEXT_PUBLIC_APP_GIT_SHA)}</span>
      <nav aria-label="Explore"><Link href="/live">Live</Link> · <Link href="/predictions">Predictions</Link></nav>
      <nav className="site-footer-links" aria-label="Legal">
        <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link>
        <span aria-hidden>·</span>
        <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
      </nav>
    </footer>
  );
}

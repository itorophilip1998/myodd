import Link from 'next/link';

export function ResponsibleFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-meta">© 2026 myOdd · 18+ · Gamble responsibly</p>
      <nav className="site-footer-links" aria-label="Legal">
        <Link href="/terms">Terms of Service</Link>
        <span aria-hidden>·</span>
        <Link href="/privacy">Privacy Policy</Link>
      </nav>
    </footer>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';

export function LegalPage({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <main className="workspace legal-workspace">
      <header className="legal-page-head">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-effective">Effective 18 October 2026 · myOdd</p>
        <nav className="legal-switch" aria-label="Legal documents">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
      </header>
      <article className="legal-body">{children}</article>
    </main>
  );
}

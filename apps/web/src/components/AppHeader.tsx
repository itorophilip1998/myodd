'use client';
import { BrandMark } from './BrandMark';
import { AccountControls } from './AccountSession';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Create', active: (path: string) => path === '/' || path.startsWith('/generate') || path.startsWith('/result') },
  { href: '/predictions', label: 'Predictions', active: (path: string) => path.startsWith('/predictions') },
  { href: '/history', label: 'Codes', active: (path: string) => path.startsWith('/history') || path.startsWith('/g/') || path.startsWith('/code/') },
] as const;

export function AppHeader() {
  const path = usePathname();

  return (
    <>
      <header className="app-header">
        <div className="header-lead">
          <Link href="/" className="brand">
            <BrandMark />myOdd<span className="brand-dot">.</span>
          </Link>
        </div>

        <nav className="app-nav-desktop" aria-label="Main navigation">
          {LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="app-nav-link"
              aria-current={link.active(path) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <AccountControls />
      </header>

      <nav className="app-nav-mobile" aria-label="Main navigation">
        {LINKS.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="app-nav-mobile-item"
            aria-current={link.active(path) ? 'page' : undefined}
          >
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

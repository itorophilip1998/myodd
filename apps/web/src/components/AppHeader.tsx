'use client';
import { BrandMark } from './BrandMark';
import { AccountControls } from './AccountSession';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatAppVersion } from '@myodd/shared';

const LINKS = [
  { href: '/', label: 'Create', active: (path: string) => path === '/' || path.startsWith('/result') },
  { href: '/live', label: 'Live', live: true, active: (path: string) => path.startsWith('/live') },
  { href: '/predictions', label: 'Predictions', active: (path: string) => path.startsWith('/predictions') },
  { href: '/history', label: 'Saved', active: (path: string) => path.startsWith('/history') || path.startsWith('/g/') },
] as const;

export function AppHeader() {
  const path = usePathname();
  const version = formatAppVersion(process.env.NEXT_PUBLIC_APP_GIT_SHA);

  return (
    <>
      <header className="app-header">
        <div className="header-lead">
          <Link href="/" className="brand">
            <BrandMark />myOdd<span className="brand-dot">.</span>
          </Link>
          <span className="header-version" title="App version">{version}</span>
        </div>

        <nav className="app-nav-desktop" aria-label="Main navigation">
          {LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`app-nav-link${'live' in link && link.live ? ' is-live' : ''}`}
              aria-current={link.active(path) ? 'page' : undefined}
            >
              {'live' in link && link.live ? <i className="nav-live-dot" aria-hidden /> : null}
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
            {'live' in link && link.live ? <i className="nav-live-dot" aria-hidden /> : null}
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

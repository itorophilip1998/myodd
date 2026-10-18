'use client';
import { BrandMark } from './BrandMark';
import { AccountControls } from './AccountSession';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function AppHeader() {
  const path = usePathname();
  const links = [
    { href: '/', label: 'Create', active: path === '/' || path.startsWith('/result') },
    { href: '/live', label: 'Live Games', active: path.startsWith('/live') },
    { href: '/predictions', label: 'Predictions', active: path.startsWith('/predictions') },
    { href: '/history', label: 'Saved codes', active: path.startsWith('/history') || path.startsWith('/g/') },
    { href: '/settings', label: 'Settings', active: path.startsWith('/settings') },
  ];
  return (
    <header className="app-header">
      <Link href="/" className="brand"><BrandMark />myOdd<span className="brand-dot">.</span></Link>
      <nav aria-label="Main navigation">
        {links.map(link => (
          <Link key={link.href} href={link.href} aria-current={link.active ? 'page' : undefined}>
            {link.href === '/live' && <i className="nav-live-dot" aria-hidden />}
            {link.label}
          </Link>
        ))}
      </nav>
      <AccountControls />
    </header>
  );
}

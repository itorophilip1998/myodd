'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

function canGoBack() {
  if (typeof window === 'undefined') return false;
  return window.history.length > 1;
}

export function BackButton({
  href = '/',
  label = 'Back',
  className = 'back-button',
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        if (canGoBack()) router.back();
        else router.push(href);
      }}
    >
      <span aria-hidden>←</span>
      <span className="back-button-label">{label}</span>
    </button>
  );
}

/** Static link when history back is not desired (e.g. known parent). */
export function BackLink({
  href,
  label = 'Back',
  className = 'back-button',
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={className}>
      <span aria-hidden>←</span>
      <span className="back-button-label">{label}</span>
    </Link>
  );
}

export function fallbackForPath(path: string): { href: string; label: string } {
  if (path.startsWith('/g/') || path.startsWith('/code/')) return { href: '/history', label: 'Saved codes' };
  if (path.startsWith('/result/')) return { href: '/', label: 'Create' };
  if (path.startsWith('/settings')) return { href: '/', label: 'Create' };
  if (path.startsWith('/live') || path.startsWith('/predictions') || path.startsWith('/history')) {
    return { href: '/', label: 'Create' };
  }
  if (path.startsWith('/sign-in') || path.startsWith('/sign-up')) return { href: '/', label: 'Home' };
  if (path.startsWith('/terms') || path.startsWith('/privacy')) return { href: '/', label: 'Home' };
  return { href: '/', label: 'Back' };
}

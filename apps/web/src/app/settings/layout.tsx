import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Settings · myOdd', alternates: { canonical: '/settings' }, robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

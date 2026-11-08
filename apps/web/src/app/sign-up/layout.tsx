import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Sign up · myOdd', alternates: { canonical: '/sign-up' }, robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

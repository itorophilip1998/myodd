import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Codes · myOdd', alternates: { canonical: '/history' }, robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

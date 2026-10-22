import { siteUrl } from '@/lib/public-seo';
import { AccountSession, GuestSession } from '@/components/AccountSession';
import { clerkRuntimeConfig } from '@/lib/clerk-config';
import { ClerkProvider } from '@clerk/nextjs';
import { AppHeader } from '@/components/AppHeader';
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Analytics } from '@/components/Analytics';
import { ResponsibleFooter } from '@/components/ResponsibleFooter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  openGraph: { title: 'myOdd — football booking codes', description: 'Create and manage football booking collections. 18+ | Gamble responsibly.', images: ['/icon.png'] },
  title: 'myOdd — smarter SportyBet slip variations',
  description:
    'Paste a SportyBet code or describe what you want. myOdd ranks selections from live odds and generates shareable booking codes. 18+ | Gamble responsibly.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerk = clerkRuntimeConfig();
  const content = <div className="min-h-screen flex flex-col"><AppHeader /><div className="flex-1">{children}</div><ResponsibleFooter /><Analytics /></div>;
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var s=JSON.parse(localStorage.getItem('myodd-ui-settings-v1')||'{}');var t=s.theme;document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()` }} /></head><body>{clerk.configured ? <ClerkProvider publishableKey={clerk.publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/history" signUpFallbackRedirectUrl="/history" appearance={{ variables: { colorPrimary: '#a9d872', colorBackground: '#17231f', colorForeground: '#e8f1e3', colorInput: '#0e1713', colorInputForeground: '#e8f1e3', borderRadius: '12px' } }}><Providers><AccountSession>{content}</AccountSession></Providers></ClerkProvider> : <Providers><GuestSession>{content}</GuestSession></Providers>}</body></html>;
}

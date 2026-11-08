import { siteUrl, publicMetadata, HOME_TITLE, HOME_DESCRIPTION, GOOGLE_VERIFICATION } from '@/lib/public-seo';
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
  ...publicMetadata('/', HOME_TITLE, HOME_DESCRIPTION),
  metadataBase: siteUrl(),
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || GOOGLE_VERIFICATION },
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerk = clerkRuntimeConfig();
  const content = <div className="min-h-screen flex flex-col"><AppHeader /><div className="flex-1">{children}</div><ResponsibleFooter /><Analytics /></div>;
  return <html lang="en"><body>{clerk.configured ? <ClerkProvider publishableKey={clerk.publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/history" signUpFallbackRedirectUrl="/history" appearance={{ variables: { colorPrimary: '#a9d872', colorBackground: '#17231f', colorForeground: '#e8f1e3', colorInput: '#0e1713', colorInputForeground: '#e8f1e3', borderRadius: '12px' } }}><Providers><AccountSession>{content}</AccountSession></Providers></ClerkProvider> : <Providers><GuestSession>{content}</GuestSession></Providers>}</body></html>;
}

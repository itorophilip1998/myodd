import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ResponsibleFooter } from '@/components/ResponsibleFooter';

export const metadata: Metadata = {
  title: 'myOdd — smarter SportyBet slip variations',
  description:
    'Paste a SportyBet code or describe what you want. myOdd ranks selections from live odds and generates shareable booking codes. 18+ | Gamble responsibly.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col bg-pitch">
            <div className="flex-1">{children}</div>
            <ResponsibleFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}

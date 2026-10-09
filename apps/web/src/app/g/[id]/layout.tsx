import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shared slips · myOdd',
  description:
    'Public SportyBet booking codes generated with myOdd. 18+ | Gamble responsibly. Probabilities, not guarantees.',
};

export default function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

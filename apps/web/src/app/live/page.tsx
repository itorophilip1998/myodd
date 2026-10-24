import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Live football matches · myOdd', description: 'Follow available live football fixtures. 18+ | Gamble responsibly.', alternates: { canonical: '/live' } };
import { GameExplorer } from '@/components/GameExplorer';
export default function LiveGamesPage() { return <GameExplorer kind="live" />; }

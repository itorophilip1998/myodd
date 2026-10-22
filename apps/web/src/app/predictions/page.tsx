import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Football selections · myOdd', description: 'Explore football selections from available bookmaker markets. Outcomes are not guaranteed. 18+ | Gamble responsibly.', alternates: { canonical: '/predictions' } };
import { GameExplorer } from '@/components/GameExplorer';
export default function PredictionsPage() { return <GameExplorer kind="predictions" />; }

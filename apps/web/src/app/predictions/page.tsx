import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Football selections · myOdd', description: 'Explore football selections from available bookmaker markets. Outcomes are not guaranteed. 18+ | Gamble responsibly.', alternates: { canonical: '/predictions' }, robots: { index: false, follow: true } };
import { PredictionPerformance } from '@/components/PredictionPerformance';
import { GameExplorer } from '@/components/GameExplorer';
export default function PredictionsPage() { return <><PredictionPerformance /><GameExplorer kind="predictions" /></>; }

import { VarianceLevel } from './enums';

export function classifyVariance(
  totalOdds: number,
  confidence: number,
): VarianceLevel {
  if (totalOdds <= 4 && confidence >= 70) return VarianceLevel.LOWER;
  if (totalOdds >= 10 || confidence < 55) return VarianceLevel.HIGHER;
  return VarianceLevel.MODERATE;
}

export function combinedOdds(odds: number[]): number {
  if (odds.length === 0) return 0;
  const product = odds.reduce((acc, o) => acc * o, 1);
  return Math.round(product * 100) / 100;
}

export function generatePublicId(length = 5): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function buildShareMessage(input: {
  code: string;
  selectionCount: number;
  totalOdds: number;
  platform?: string;
}): string {
  return [
    "Today's Slip",
    '',
    `Platform: ${input.platform ?? 'SportyBet'}`,
    `Code: ${input.code}`,
    '',
    `Selections: ${input.selectionCount}`,
    `Odds: ${input.totalOdds.toFixed(2)}`,
    '',
    'Generated with myOdd',
    '',
    '18+ | Gamble responsibly',
  ].join('\n');
}

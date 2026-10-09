import { Injectable } from '@nestjs/common';
import {
  RiskPreference,
  combinedOdds,
  type GenerationConfig,
  type ScoredSelection,
} from '@myodd/shared';
import { scoreSlip, slipFingerprint } from './slip-fingerprint';

export interface CandidateSlip {
  selections: ScoredSelection[];
  totalOdds: number;
  slipScore: number;
  fingerprint: string;
}

@Injectable()
export class SlipGeneratorService {
  generate(
    pool: ScoredSelection[],
    config: GenerationConfig,
  ): CandidateSlip[] {
    const filtered = filterPool(pool, config);
    if (filtered.length < config.minimumSelections) {
      return [];
    }

    const sorted = [...filtered].sort((a, b) => b.confidence - a.confidence);
    const target = config.numberOfSlips;
    const results: CandidateSlip[] = [];
    const seen = new Set<string>();

    const minLegs = config.minimumSelections;
    const maxLegs = Math.min(config.maximumSelections, sorted.length);

    // Seeded greedy + diversification passes
    for (let seed = 0; seed < sorted.length && results.length < target * 3; seed++) {
      for (let legs = minLegs; legs <= maxLegs; legs++) {
        const combo = buildCombo(sorted, legs, seed, config);
        if (!combo) continue;
        const total = combinedOdds(combo.map((c) => c.odds ?? 1));
        if (total < config.minimumOdds || total > config.maximumOdds) continue;
        const fingerprint = slipFingerprint(combo);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        results.push({
          selections: combo,
          totalOdds: total,
          slipScore: scoreSlip(combo),
          fingerprint,
        });
      }
    }

    // Randomish diversify if still short
    let attempts = 0;
    while (results.length < target * 2 && attempts < target * 40) {
      attempts += 1;
      const legs =
        minLegs + Math.floor(Math.random() * (maxLegs - minLegs + 1));
      const combo = randomCombo(sorted, legs, attempts);
      if (!combo) continue;
      const total = combinedOdds(combo.map((c) => c.odds ?? 1));
      if (total < config.minimumOdds || total > config.maximumOdds) continue;
      const fingerprint = slipFingerprint(combo);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      results.push({
        selections: combo,
        totalOdds: total,
        slipScore: scoreSlip(combo),
        fingerprint,
      });
    }

    return results
      .sort((a, b) => b.slipScore - a.slipScore)
      .slice(0, target);
  }
}

function filterPool(
  pool: ScoredSelection[],
  config: GenerationConfig,
): ScoredSelection[] {
  const floor =
    config.riskPreference === RiskPreference.LOWER
      ? 65
      : config.riskPreference === RiskPreference.HIGHER
        ? 40
        : 55;

  const marketSet = new Set(config.markets);
  const excluded = config.excludedTeams.map((t) => t.toLowerCase());
  const kickoffBefore = config.kickoffBefore
    ? new Date(config.kickoffBefore).getTime()
    : null;

  return pool.filter((s) => {
    if (!marketSet.has(s.supportedMarket)) return false;
    if (s.confidence < floor) return false;
    if (excluded.length) {
      const home = (s.homeTeam ?? '').toLowerCase();
      const away = (s.awayTeam ?? '').toLowerCase();
      if (excluded.some((t) => home.includes(t) || away.includes(t))) {
        return false;
      }
    }
    if (kickoffBefore && s.kickoffAt) {
      if (new Date(s.kickoffAt).getTime() > kickoffBefore) return false;
    }
    return true;
  });
}

function buildCombo(
  sorted: ScoredSelection[],
  legs: number,
  seed: number,
  config: GenerationConfig,
): ScoredSelection[] | null {
  const picked: ScoredSelection[] = [];
  const usedEvents = new Set<string>();
  let i = seed % sorted.length;
  let scanned = 0;

  while (picked.length < legs && scanned < sorted.length * 2) {
    const candidate = sorted[i % sorted.length];
    i += 1;
    scanned += 1;
    if (usedEvents.has(candidate.eventId)) continue;

    const trial = [...picked, candidate];
    const odds = combinedOdds(trial.map((t) => t.odds ?? 1));
    if (odds > config.maximumOdds && picked.length + 1 < legs) {
      // skip very expensive early legs for lower variance
      if (config.riskPreference === RiskPreference.LOWER && (candidate.odds ?? 1) > 2.2) {
        continue;
      }
    }

    picked.push(candidate);
    usedEvents.add(candidate.eventId);
  }

  return picked.length >= Math.min(legs, config.minimumSelections)
    ? picked
    : null;
}

function randomCombo(
  sorted: ScoredSelection[],
  legs: number,
  salt: number,
): ScoredSelection[] | null {
  const shuffled = [...sorted].sort((a, b) => {
    const ha = hash(`${a.eventId}:${a.outcomeId}:${salt}`);
    const hb = hash(`${b.eventId}:${b.outcomeId}:${salt}`);
    return ha - hb;
  });
  const picked: ScoredSelection[] = [];
  const used = new Set<string>();
  for (const c of shuffled) {
    if (used.has(c.eventId)) continue;
    picked.push(c);
    used.add(c.eventId);
    if (picked.length >= legs) break;
  }
  return picked.length === legs ? picked : null;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

import { describe, expect, it, vi } from 'vitest';
import { observation } from '../src/learning/observation';
import { performanceReport, uniqueOutcomes, type ObservationRow } from '../src/learning/performance';
import { ModelLearningService } from '../src/learning/model-learning.service';

const date = (value: string) => new Date(value);
function row(changes: Partial<ObservationRow> = {}): ObservationRow {
  return { id: 'leg', slipId: 'ticket', ticketSize: 1, eventId: 'event', marketId: '18', outcomeId: '12', specifier: 'total=1.5',
    marketName: 'Over/Under', league: 'League', mode: 'INVESTOR', probability: .8, baseProbability: .9,
    modelVersion: 'odds-v2@cal-v1-test', baseModelVersion: 'odds-v2', predictedAt: date('2025-01-01T10:00Z'),
    kickoffAt: date('2025-01-01T12:00Z'), resultKnownAt: date('2025-01-01T14:00Z'),
    result: 'WON', resultSource: 'SPORTYBET_SHARE_JSON', verified: true, ...changes };
}
const forecast = { id: 'leg', sportyEventId: 'event', marketId: '18', outcomeId: '12', specifier: 'total=1.5',
  predictedAt: date('2025-01-01T10:00Z'), kickoffAt: date('2025-01-01T12:00Z'), predictionProbability: .8,
  baseProbability: .9, modelVersion: 'cal-test', baseModelVersion: 'odds-v2', odds: 1.25, result: 'PENDING', matchPhase: 'prematch' };

describe('verified forecast observations', () => {
  it('retains pre-kickoff probabilities and preserves the first-known label time on repeat checks', () => {
    const checked = date('2025-01-01T15:00Z');
    const first = observation(forecast, 'ticket', 'WON', 'SPORTYBET_SHARE_JSON', 'finished', false, checked, 1)!;
    expect(first.create).toMatchObject({ probability: .8, baseProbability: .9, verified: true, resultKnownAt: checked });
    const again = observation({ ...forecast, result: 'WON', matchPhase: 'finished' }, 'ticket', 'WON', 'SPORTYBET_SHARE_JSON', 'finished', false, checked, 1)!;
    expect(again.update).not.toHaveProperty('resultKnownAt');
    expect(again.update).not.toHaveProperty('probability');
  });
  it('records corrections and revokes conflicted, live or unsupported labels', () => {
    const checked = date('2025-01-01T15:00Z');
    const correction = observation({ ...forecast, result: 'WON' }, 'ticket', 'LOST', 'SPORTYBET_SHARE_JSON', 'finished', false, checked, 1)!;
    expect(correction.update).toMatchObject({ result: 'LOST', resultKnownAt: checked, verified: true });
    for (const [phase, conflict, source] of [['finished', true, 'SPORTYBET_SHARE_JSON'], ['live', false, 'SPORTYBET_SHARE_JSON'], ['finished', false, 'USER_FEEDBACK']] as const) {
      expect(observation(forecast, 'ticket', 'WON', source, phase, conflict, checked, 1)!.update.verified).toBe(false);
    }
  });
  it('does not invent training data for old rows missing prediction timestamps or base forecasts', () => {
    const checked = date('2025-01-01T15:00Z');
    expect(observation({ ...forecast, predictedAt: null }, 't', 'WON', 'SPORTYBET_SHARE_JSON', 'finished', false, checked, 1)).toBeNull();
    expect(observation({ ...forecast, predictedAt: forecast.kickoffAt }, 't', 'WON', 'SPORTYBET_SHARE_JSON', 'finished', false, checked, 1)).toBeNull();
    expect(observation({ ...forecast, baseProbability: null }, 't', 'WON', 'SPORTYBET_SHARE_JSON', 'finished', false, checked, 1)).toBeNull();
  });
});

describe('performance and learning data', () => {
  it('deduplicates users betting the same option and excludes void, unverified and future labels', () => {
    const data = [row(), row({ id: 'repeat', predictedAt: date('2025-01-01T11:00Z') }),
      row({ id: 'void', eventId: 'void', result: 'VOID' }), row({ id: 'pending', eventId: 'pending', verified: false }),
      row({ id: 'bad', eventId: 'bad', resultSource: 'USER_FEEDBACK' }), row({ id: 'future', eventId: 'future', resultKnownAt: date('2099-01-01T00:00Z') })];
    expect(uniqueOutcomes(data)).toHaveLength(1);
    const report = performanceReport(data);
    expect(report.overall).toMatchObject({ samples: 1, wins: 1, losses: 0, winRate: 1 });
    expect(report.overall.brier).toBeCloseTo(.04);
    expect(report.baseline.brier).toBeCloseTo(.01);
    expect(report.byMode[0].name).toBe('INVESTOR');
  });
  it('tracks complete ticket outcomes separately from selection hit rates', () => {
    const report = performanceReport([row({ id: 'a', ticketSize: 2 }), row({ id: 'b', ticketSize: 2, eventId: 'b', result: 'LOST' }),
      row({ id: 'c', slipId: 'incomplete', ticketSize: 2, eventId: 'c' })]);
    expect(report.overall.winRate).toBeCloseTo(2 / 3);
    expect(report.tickets).toMatchObject({ won: 0, lost: 1, awaitingVerification: 1, winRate: 0 });
  });
  it('returns a real collecting state instead of manufactured empty-data accuracy', () => {
    expect(performanceReport([]).overall).toMatchObject({ samples: 0, winRate: null, brier: null });
  });
  it('only sends verified de-duplicated forecasts to the internal learner and journals the evaluation', async () => {
    const prisma = { predictionObservation: { findMany: vi.fn().mockResolvedValue([row(), row({ id: 'duplicate' }), row({ eventId: 'bad', verified: false })]) }, trainingEvent: { create: vi.fn() } };
    const ai = { updateLearning: vi.fn().mockResolvedValue({ promoted: false, reason: 'Collecting' }) };
    await new ModelLearningService(prisma as any, ai as any).refresh();
    expect(ai.updateLearning).toHaveBeenCalledWith([expect.objectContaining({ id: 'duplicate', eventId: 'event', baseProbability: .9 })]);
    const sample = ai.updateLearning.mock.calls[0][0][0];
    expect(sample).not.toHaveProperty('slipId');
    expect(prisma.trainingEvent.create).toHaveBeenCalledWith({ data: { kind: 'MODEL_EVALUATION', payload: { promoted: false, reason: 'Collecting' } } });
  });
});

it('quarantines contradictory verified outcomes for the same exact selection', () => {
  expect(uniqueOutcomes([row(), row({ id: 'contradiction', result: 'LOST' })])).toEqual([]);
  expect(uniqueOutcomes([row(), row({ id: 'void-correction', result: 'VOID' })])).toEqual([]);
});

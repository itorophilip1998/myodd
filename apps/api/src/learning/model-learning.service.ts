import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiClient } from '../ai/ai.client';
import { performanceReport, uniqueOutcomes } from './performance';

@Injectable()
export class ModelLearningService {
  constructor(private readonly prisma: PrismaService, private readonly ai: AiClient) {}

  private observations() {
    return this.prisma.predictionObservation.findMany({
      where: { kickoffAt: { gte: new Date(Date.now() - 90 * 86400_000) } },
      orderBy: [{ kickoffAt: 'desc' }, { id: 'asc' }], take: 10000,
    });
  }

  async performance() {
    const [rows, learning] = await Promise.all([
      this.observations(), this.ai.learningStatus().catch(() => ({ state: 'unavailable', active: null, lastEvaluation: null })),
    ]);
    return { ...performanceReport(rows), learning };
  }

  async refresh() {
    const rows = uniqueOutcomes(await this.observations());
    const samples = rows.map(({ id, eventId, marketId, outcomeId, specifier, marketName, league, mode,
      probability, baseProbability, modelVersion, baseModelVersion, result, predictedAt, kickoffAt, resultKnownAt }) => ({
      id, eventId, marketId, outcomeId, specifier, marketName, league, mode, probability, baseProbability,
      modelVersion, baseModelVersion, result, predictedAt, kickoffAt, resultKnownAt,
    }));
    const report = await this.ai.updateLearning(samples);
    await this.prisma.trainingEvent.create({ data: { kind: 'MODEL_EVALUATION', payload: JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue } });
    return report;
  }
}

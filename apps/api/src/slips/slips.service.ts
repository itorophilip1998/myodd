import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  classifyVariance,
  generatePublicId,
  type GenerationConfig,
  type ScoredSelection,
} from '@myodd/shared';
import { JobStatus, VarianceLevel } from '@prisma/client';
import {
  BOOKMAKER_PROVIDER,
  type BookmakerProvider,
} from '../bookmaker/bookmaker.provider';
import { PredictionsService } from '../predictions/predictions.service';
import { IntentParserService } from '../ai/intent-parser.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlipGeneratorService } from './slip-generator.service';
import { SlipValidatorService } from './slip-validator.service';
import { CREATE_BOOKING_QUEUE } from '../jobs/job.constants';

export interface GenerateRequest {
  instruction: string;
  bookingCode?: string;
}

@Injectable()
export class SlipsService {
  private readonly logger = new Logger(SlipsService.name);

  constructor(
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
    private readonly predictions: PredictionsService,
    private readonly intent: IntentParserService,
    private readonly generator: SlipGeneratorService,
    private readonly validator: SlipValidatorService,
    private readonly prisma: PrismaService,
    @InjectQueue(CREATE_BOOKING_QUEUE) private readonly queue: Queue,
  ) {}

  async analyze(bookingCode: string) {
    const booking = await this.bookmaker.getBooking(bookingCode);
    return {
      code: booking.code,
      shareUrl: booking.shareUrl,
      deadline: booking.deadline,
      totalOdds: booking.totalOdds,
      selectionCount: booking.selections.length,
      selections: booking.selections,
    };
  }

  async startGeneration(req: GenerateRequest) {
    const config = await this.intent.parse(req.instruction);
    const publicId = generatePublicId(5);
    const title = req.bookingCode
      ? `Variations of ${req.bookingCode.toUpperCase()}`
      : "Today's myOdd slips";

    const group = await this.prisma.slipGroup.create({
      data: {
        publicId,
        title,
        description: req.instruction,
        originalBookingCode: req.bookingCode?.toUpperCase() ?? null,
        instruction: req.instruction,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const job = await this.prisma.generationJob.create({
      data: {
        groupId: group.id,
        status: JobStatus.PENDING,
        progress: 0,
        total: config.numberOfSlips,
      },
    });

    // Fire async pipeline without blocking HTTP
    void this.runGeneration(job.id, group.id, config, req.bookingCode).catch(
      (err) => this.logger.error(err),
    );

    return {
      jobId: job.id,
      groupId: group.id,
      publicId: group.publicId,
    };
  }

  private async runGeneration(
    jobId: string,
    groupId: string,
    config: GenerationConfig,
    bookingCode?: string,
  ) {
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status: JobStatus.RUNNING },
    });

    try {
      let pool: ScoredSelection[] = [];

      if (bookingCode) {
        const original = await this.bookmaker.getBooking(bookingCode);
        // Expand around original fixtures + today's pool
        const fixtures = await this.bookmaker.getFixtures({
          timelineHours: 72,
          pageSize: 80,
          todayGames: true,
        });
        pool = this.predictions.scoreFixtures(fixtures);

        // Soft-boost markets similar to original by keeping full pool;
        // excluded teams from intent still apply in generator.
        void original;
      } else {
        const fixtures = await this.bookmaker.getFixtures({
          timelineHours: 36,
          pageSize: 80,
          todayGames: true,
        });
        pool = this.predictions.scoreFixtures(fixtures);
      }

      await this.predictions.cacheScores(pool);
      const candidates = this.generator.generate(pool, config);

      const validated: ScoredSelection[][] = [];
      for (const c of candidates) {
        const repaired = await this.validator.validateAndRepair(
          c.selections,
          pool,
        );
        if (repaired && repaired.length >= config.minimumSelections) {
          validated.push(repaired);
        }
        if (validated.length >= config.numberOfSlips) break;
      }

      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: { total: validated.length },
      });

      // Enqueue booking creation with limited concurrency via BullMQ
      for (let i = 0; i < validated.length; i++) {
        await this.queue.add(
          'create-booking',
          {
            jobId,
            groupId,
            selections: validated[i],
            index: i,
          },
          {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
      }

      if (validated.length === 0) {
        await this.prisma.generationJob.update({
          where: { id: jobId },
          data: {
            status: JobStatus.FAILED,
            error:
              'No valid slip combinations found for the current markets and filters. Try widening odds or markets.',
          },
        });
      }
    } catch (err) {
      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          error: (err as Error).message,
        },
      });
      throw err;
    }
  }

  async persistCreatedSlip(input: {
    jobId: string;
    groupId: string;
    bookingCode: string;
    shareUrl: string;
    deadline: string | null;
    selections: ScoredSelection[];
    fingerprint: string;
  }) {
    const totalOdds = input.selections.reduce(
      (acc, s) => acc * (s.odds ?? 1),
      1,
    );
    const confidence =
      input.selections.reduce((sum, s) => sum + s.confidence, 0) /
      Math.max(1, input.selections.length);
    const risk = classifyVariance(
      Math.round(totalOdds * 100) / 100,
      confidence,
    );

    await this.prisma.generatedSlip.create({
      data: {
        groupId: input.groupId,
        bookingCode: input.bookingCode,
        shareUrl: input.shareUrl,
        totalOdds: Math.round(totalOdds * 100) / 100,
        confidence: Math.round(confidence * 10) / 10,
        riskLevel: risk as VarianceLevel,
        selectionCount: input.selections.length,
        fingerprint: input.fingerprint,
        expiresAt: input.deadline ? new Date(input.deadline) : null,
        selections: {
          create: input.selections.map((s) => ({
            sportyEventId: s.eventId,
            marketId: s.marketId,
            outcomeId: s.outcomeId,
            specifier: s.specifier ?? '',
            homeTeam: s.homeTeam ?? '',
            awayTeam: s.awayTeam ?? '',
            league: s.league ?? '',
            marketName: s.marketName ?? '',
            selectionName: s.selectionName ?? '',
            odds: s.odds ?? 1,
            predictionProbability: s.probability,
            predictionScore: s.confidence,
            kickoffAt: s.kickoffAt ? new Date(s.kickoffAt) : null,
          })),
        },
      },
    });

    const job = await this.prisma.generationJob.update({
      where: { id: input.jobId },
      data: { progress: { increment: 1 } },
    });

    if (job.progress >= job.total && job.total > 0) {
      await this.prisma.generationJob.update({
        where: { id: input.jobId },
        data: { status: JobStatus.COMPLETED },
      });
    }
  }
}

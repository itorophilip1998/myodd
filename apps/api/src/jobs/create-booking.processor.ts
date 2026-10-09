import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import type { ScoredSelection } from '@myodd/shared';
import {
  BOOKMAKER_PROVIDER,
  type BookmakerProvider,
} from '../bookmaker/bookmaker.provider';
import { SlipsService } from '../slips/slips.service';
import { slipFingerprint } from '../slips/slip-fingerprint';
import { CREATE_BOOKING_QUEUE } from './job.constants';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus } from '@prisma/client';

interface CreateBookingJob {
  jobId: string;
  groupId: string;
  selections: ScoredSelection[];
  index: number;
}

@Processor(CREATE_BOOKING_QUEUE, { concurrency: 3 })
export class CreateBookingProcessor extends WorkerHost {
  private readonly logger = new Logger(CreateBookingProcessor.name);

  constructor(
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
    @Inject(forwardRef(() => SlipsService)) private readonly slips: SlipsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<CreateBookingJob>) {
    const { jobId, groupId, selections } = job.data;
    try {
      const booking = await this.bookmaker.createBooking(selections);
      if (booking.unavailableOutcomes?.length) {
        this.logger.warn(
          `Booking ${booking.code} had unavailable outcomes; storing confirmed legs only`,
        );
      }
      await this.slips.persistCreatedSlip({
        jobId,
        groupId,
        bookingCode: booking.code,
        shareUrl: booking.shareUrl,
        deadline: booking.deadline,
        selections,
        fingerprint: slipFingerprint(selections),
      });
    } catch (err) {
      this.logger.error(
        `Failed to create booking for job ${jobId}: ${(err as Error).message}`,
      );
      // Increment progress anyway so UI can finish; mark partial failure in job error if all fail
      const current = await this.prisma.generationJob.update({
        where: { id: jobId },
        data: { progress: { increment: 1 } },
      });
      if (current.progress >= current.total && current.total > 0) {
        const slipCount = await this.prisma.generatedSlip.count({
          where: { groupId },
        });
        await this.prisma.generationJob.update({
          where: { id: jobId },
          data: {
            status:
              slipCount > 0 ? JobStatus.COMPLETED : JobStatus.FAILED,
            error:
              slipCount > 0
                ? null
                : 'SportyBet rejected all booking requests. Markets may have changed — try again.',
          },
        });
      }
    }
  }
}

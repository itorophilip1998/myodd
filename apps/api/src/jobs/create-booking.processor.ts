import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { withinModeOdds, withinModeSelectionOdds, type BookmakerBooking, type ScoredSelection } from '@myodd/shared';
import { BOOKMAKER_PROVIDER, type BookmakerProvider } from '../bookmaker/bookmaker.provider';
import { SlipsService, type PrepareJob, type BookingJob } from '../slips/slips.service';
import { SlipValidatorService } from '../slips/slip-validator.service';
import { CREATE_BOOKING_QUEUE } from './job.constants';
import { PrismaService } from '../prisma/prisma.service';
import { slipFingerprint } from '../slips/slip-fingerprint';

@Processor(CREATE_BOOKING_QUEUE, { concurrency: 3 })
export class CreateBookingProcessor extends WorkerHost {
  private readonly logger = new Logger(CreateBookingProcessor.name);
  constructor(
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
    @Inject(forwardRef(() => SlipsService)) private readonly slips: SlipsService,
    private readonly prisma: PrismaService,
    private readonly validator: SlipValidatorService,
  ) { super(); }

  async process(job: Job) {
    if (job.name === 'prepare-generation') {
      const data = job.data as PrepareJob & { prepared?: Awaited<ReturnType<SlipsService['prepareGeneration']>> };
      try {
        const prepared = data.prepared ?? await this.slips.prepareGeneration(data);
        if (!prepared) return;
        await job.updateData({ ...data, prepared });
        await this.slips.enqueueBookings(data, prepared.config, prepared.candidates);
      } catch (error) {
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
          await this.slips.failPreparation(data.jobId, (error as Error).message);
        }
        throw error;
      }
      return;
    }
    const data = job.data as BookingJob & { confirmed?: { booking: BookmakerBooking; selections: ScoredSelection[] } };
    const current = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: data.jobId } });
    if (current.completedTasks.includes(job.id!)) return;
    if (data.confirmed) {
      // A database retry saves the already accepted code, without creating another upstream booking.
      await this.slips.settleBooking(job.id!, data, data.confirmed.booking, data.confirmed.selections);
      return;
    }
    let upstreamBooking: BookmakerBooking | undefined;
    let accepted: { booking: BookmakerBooking; selections: ScoredSelection[] };
    try {
      const selections = await this.validator.validate(data.selections, data.config, undefined, fixtures => this.slips.audit(data, 'VALIDATION_SNAPSHOT', { taskId: job.id, fixtures }, `${job.id}:validation:${job.attemptsMade}`));
      if (!selections) throw new Error('Selections no longer satisfy market availability or requested filters');
      await this.slips.audit(data, 'BOOKING_ATTEMPT', { taskId: job.id, selections, timestamp: new Date().toISOString() });
      const booking = await this.bookmaker.createBooking(selections);
      upstreamBooking = booking;
      if (booking.selections.some(s => s.isActive === false || (s.kickoffAt && new Date(s.kickoffAt).getTime() <= Date.now()))) throw new Error('SportyBet marked this code unavailable');
      if (booking.unavailableOutcomes.length || !booking.selections.length || slipFingerprint(booking.selections) !== slipFingerprint(selections)) {
        throw new Error('SportyBet did not confirm the requested selections');
      }
      const confirmed = selections.map(s => {
        const accepted = booking.selections.find(b => b.eventId === s.eventId && b.marketId === s.marketId && b.outcomeId === s.outcomeId && b.specifier === s.specifier)!;
        if (!Number.isFinite(accepted.odds) || !withinModeSelectionOdds(accepted.odds!, data.config.riskMode)) throw new Error('SportyBet did not confirm valid odds');
        return { ...s, odds: accepted.odds };
      });
      const totalOdds = Math.round(confirmed.reduce((n, s) => n * s.odds!, 1) * 100) / 100;
      if (!withinModeOdds(totalOdds, data.config.riskMode) || totalOdds < data.config.minimumOdds || (data.config.maximumOdds != null && totalOdds > data.config.maximumOdds)) throw new Error('Confirmed odds are outside requested range');
      accepted = { booking, selections: confirmed };
    } catch (error) {
      this.logger.warn(`Booking ${job.id} failed: ${(error as Error).message}`);
      await this.slips.audit(data, 'BOOKING_REJECTED', { taskId: job.id, error: (error as Error).message, upstreamBooking: upstreamBooking ?? null });
      await this.slips.settleBooking(job.id!, data);
      return;
    }
    // Keep the confirmation in durable Redis before attempting the atomic database write.
    // Persistence errors must retry; they must never turn a real accepted code into a failed empty task.
    await job.updateData({ ...data, confirmed: accepted });
    await this.slips.settleBooking(job.id!, data, accepted.booking, accepted.selections);
  }
}

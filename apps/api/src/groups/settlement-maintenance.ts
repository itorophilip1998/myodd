import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PlayCheckService } from './play-check.service';

export const SETTLEMENT_QUEUE = 'ticket-settlement';

@Injectable()
export class SettlementSchedule implements OnModuleInit {
  constructor(@InjectQueue(SETTLEMENT_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler('ticket-result-checks', { every: 5 * 60_000 }, {
      name: 'check-results', data: {}, opts: {
        removeOnComplete: 20, removeOnFail: 50, attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    });
  }
}

@Processor(SETTLEMENT_QUEUE, { concurrency: 1 })
export class SettlementProcessor extends WorkerHost {
  private readonly logger = new Logger(SettlementProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly checks: PlayCheckService) { super(); }

  async process() {
    const now = Date.now();
    // Retain archived bookings for checking. Recheck final results for seven days
    // after kickoff to pick up corrections; unresolved tickets remain eligible.
    const slips = await this.prisma.generatedSlip.findMany({
      where: {
        group: { deletedAt: null },
        OR: [
          { selections: { some: { kickoffAt: { lte: new Date(now) } } } },
          { selections: { some: { kickoffAt: null } } },
        ],
        AND: [
          { OR: [{ playCheckedAt: null }, { playCheckedAt: { lt: new Date(now - 5 * 60_000) } }] },
          { OR: [
            { result: { in: ['UNKNOWN', 'PENDING'] } },
            { selections: { some: { kickoffAt: { gte: new Date(now - 7 * 86400_000) } } } },
          ] },
        ],
      },
      orderBy: { playCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: 25,
      select: { id: true },
    });
    let failures = 0;
    for (const slip of slips) {
      try { await this.checks.checkSlips([slip.id]); }
      catch { failures++; this.logger.warn(`Result check failed for slip ${slip.id}`); }
    }
    if (failures) throw new Error(`${failures} ticket checks failed; retry required`);
    return { checked: slips.length };
  }
}

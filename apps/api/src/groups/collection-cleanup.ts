import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PlayCheckService } from './play-check.service';
import { collectionComplete, completionDates } from './collection-lifecycle';

export const CLEANUP_QUEUE = 'collection-cleanup';
const include = { slips: { include: { selections: true } }, jobs: { select: { status: true } } } as const;

@Injectable()
export class CleanupSchedule implements OnModuleInit {
  constructor(@InjectQueue(CLEANUP_QUEUE) private readonly queue: Queue) {}
  async onModuleInit() {
    await this.queue.upsertJobScheduler('collection-lifecycle', { every: 300_000 }, {
      name: 'collection-lifecycle', data: {}, opts: { removeOnComplete: 20, removeOnFail: 50 },
    });
  }
}

@Processor(CLEANUP_QUEUE, { concurrency: 1 })
export class CollectionCleanup extends WorkerHost {
  private readonly logger = new Logger(CollectionCleanup.name);
  constructor(private readonly prisma: PrismaService, private readonly checks: PlayCheckService) { super(); }

  async process() {
    const groups = await this.prisma.slipGroup.findMany({
      where: { slips: { some: {} } }, include,
      orderBy: [{ lifecycleCheckedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }], take: 100,
    });
    let deleted = 0; let skipped = 0;
    for (const group of groups) {
      const now = new Date();
      const dates = completionDates(collectionComplete(group), group.completedAt, now);
      await this.prisma.slipGroup.update({ where: { id: group.id }, data: { ...dates, lifecycleCheckedAt: now } });
      if (process.env.COLLECTION_CLEANUP_ENABLED !== 'true' || !dates.deleteAfter || dates.deleteAfter > now) continue;
      const refreshedAt = new Date();
      try {
        await this.checks.checkSlips(group.slips.map(slip => slip.id));
        const removed = await this.prisma.$transaction(async tx => {
          // Settlement writers lock these same selection rows. Read again after acquiring locks.
          await tx.$queryRaw`SELECT id FROM slip_groups WHERE id = ${group.id} FOR UPDATE`;
          await tx.$queryRaw`SELECT s.id FROM slip_selections s JOIN generated_slips t ON t.id = s.slip_id WHERE t.group_id = ${group.id} FOR UPDATE OF s`;
          const current = await tx.slipGroup.findUnique({ where: { id: group.id }, include });
          if (!current) return false;
          if (!collectionComplete(current, refreshedAt)) {
            await tx.slipGroup.update({ where: { id: group.id }, data: { completedAt: null, deleteAfter: null } });
            return false;
          }
          if (!current.deleteAfter || current.deleteAfter > new Date()) return false;
          await tx.generationJob.deleteMany({ where: { groupId: group.id } });
          await tx.slipGroup.delete({ where: { id: group.id } });
          await tx.trainingEvent.create({ data: { kind: 'COLLECTION_EXPIRED', payload: { groupId: group.id, deletedAt: new Date().toISOString() } } });
          return true;
        }, { timeout: 15_000 });
        if (removed) deleted++; else skipped++;
      } catch { skipped++; this.logger.warn('Collection cleanup skipped because fresh settlement verification or deletion failed'); }
    }
    this.logger.log(`Lifecycle checked ${groups.length}; deleted ${deleted}; deferred ${skipped}`);
    return { checked: groups.length, deleted, skipped };
  }
}

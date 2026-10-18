import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { SlipsService, type PrepareJob } from '../slips/slips.service';
import { PREPARE_GENERATION_QUEUE } from './job.constants';

@Processor(PREPARE_GENERATION_QUEUE, { concurrency: 2 })
export class PrepareGenerationProcessor extends WorkerHost {
  constructor(
    @Inject(forwardRef(() => SlipsService)) private readonly slips: SlipsService,
  ) { super(); }

  async process(job: Job) {
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
  }
}

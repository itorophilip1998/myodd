import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ModelLearningService } from './model-learning.service';

export const LEARNING_QUEUE = 'prediction-learning';

@Injectable()
export class LearningSchedule implements OnModuleInit {
  constructor(@InjectQueue(LEARNING_QUEUE) private readonly queue: Queue) {}
  async onModuleInit() {
    await this.queue.upsertJobScheduler('evaluate-prediction-learning', { every: 6 * 60 * 60_000 }, {
      name: 'evaluate-model', data: {}, opts: {
        removeOnComplete: 20, removeOnFail: 50, attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
      },
    });
  }
}

@Processor(LEARNING_QUEUE, { concurrency: 1 })
export class LearningProcessor extends WorkerHost {
  constructor(private readonly learning: ModelLearningService) { super(); }
  process() { return this.learning.refresh(); }
}

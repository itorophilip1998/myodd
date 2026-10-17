import { Module } from '@nestjs/common';
import { Job } from 'bullmq';
import { BullModule, Processor, WorkerHost } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { BookmakerModule } from '../bookmaker/bookmaker.module';
import { CatalogService, CATALOG_QUEUE } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Processor(CATALOG_QUEUE, { concurrency: 1 })
class CatalogProcessor extends WorkerHost {
  constructor(private readonly catalog: CatalogService) { super(); }
  async process(job: Job) { return job.name === 'verify-display' ? this.catalog.verifyCodes(job.data.codes) : this.catalog.maintain(); }
}
@Module({ imports: [AiModule, BookmakerModule, BullModule.registerQueue({ name: CATALOG_QUEUE })],
  controllers: [CatalogController], providers: [CatalogService, CatalogProcessor], exports: [CatalogService] })
export class CatalogModule {}

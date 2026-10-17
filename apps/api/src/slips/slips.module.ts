import { CatalogModule } from '../catalog/catalog.module';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BookmakerModule } from '../bookmaker/bookmaker.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { AiModule } from '../ai/ai.module';
import { SlipsService } from './slips.service';
import { SlipsController } from './slips.controller';
import { SlipValidatorService } from './slip-validator.service';
import { CREATE_BOOKING_QUEUE } from '../jobs/job.constants';

@Module({
  imports: [
    BookmakerModule,
    CatalogModule,
    PredictionsModule,
    AiModule,
    BullModule.registerQueue({ name: CREATE_BOOKING_QUEUE }),
  ],
  controllers: [SlipsController],
  providers: [
    SlipsService,
    SlipValidatorService,
  ],
  exports: [SlipsService, SlipValidatorService],
})
export class SlipsModule {}

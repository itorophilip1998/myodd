import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BookmakerModule } from '../bookmaker/bookmaker.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { AiModule } from '../ai/ai.module';
import { SlipsService } from './slips.service';
import { SlipsController } from './slips.controller';
import { SlipGeneratorService } from './slip-generator.service';
import { SlipValidatorService } from './slip-validator.service';
import { CREATE_BOOKING_QUEUE } from '../jobs/job.constants';

@Module({
  imports: [
    BookmakerModule,
    PredictionsModule,
    AiModule,
    BullModule.registerQueue({ name: CREATE_BOOKING_QUEUE }),
  ],
  controllers: [SlipsController],
  providers: [
    SlipsService,
    SlipGeneratorService,
    SlipValidatorService,
  ],
  exports: [SlipsService],
})
export class SlipsModule {}

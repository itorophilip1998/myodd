import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BookmakerModule } from '../bookmaker/bookmaker.module';
import { CREATE_BOOKING_QUEUE } from './job.constants';
import { CreateBookingProcessor } from './create-booking.processor';
import { JobsController } from './jobs.controller';
import { SlipsModule } from '../slips/slips.module';

@Module({
  imports: [
    BookmakerModule,
    BullModule.registerQueue({ name: CREATE_BOOKING_QUEUE }),
    forwardRef(() => SlipsModule),
  ],
  controllers: [JobsController],
  providers: [CreateBookingProcessor],
})
export class JobsModule {}

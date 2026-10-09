import { Module } from '@nestjs/common';
import { BookmakerModule } from '../bookmaker/bookmaker.module';
import { BookingsController } from './bookings.controller';

@Module({
  imports: [BookmakerModule],
  controllers: [BookingsController],
})
export class BookingsModule {}

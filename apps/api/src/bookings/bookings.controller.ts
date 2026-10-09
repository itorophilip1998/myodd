import { Controller, Get, Inject, Param } from '@nestjs/common';
import {
  BOOKMAKER_PROVIDER,
  type BookmakerProvider,
} from '../bookmaker/bookmaker.provider';
import { RateLimitService } from '../common/rate-limit.service';

@Controller('bookings')
export class BookingsController {
  constructor(
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get(':code')
  async getBooking(@Param('code') code: string) {
    await this.rateLimit.consume('bookings', 40);
    const booking = await this.bookmaker.getBooking(code);
    return {
      code: booking.code,
      shareUrl: booking.shareUrl,
      deadline: booking.deadline,
      totalOdds: booking.totalOdds,
      selectionCount: booking.selections.length,
      selections: booking.selections,
      unavailableOutcomes: booking.unavailableOutcomes,
    };
  }
}

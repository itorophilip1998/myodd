import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PREDICTION_MARKETS, type PredictionMarket } from '@myodd/shared';
import { ExploreService } from './explore.service';
import { RateLimitService } from '../common/rate-limit.service';
@Controller('explore')
export class ExploreController {
  constructor(private readonly explore: ExploreService, private readonly limit: RateLimitService) {}
  @Get('live') async live() { await this.limit.consume('live-explorer', 120); return this.explore.live(); }
  @Get('predictions') async predictions(@Query('market') market = 'all', @Query('eventId') eventId?: string, @Query('limit') rawLimit = '50') {
    if (!PREDICTION_MARKETS.some(m => m.value === market)) throw new BadRequestException('Unknown prediction market');
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000 || (!eventId && limit > 50)) throw new BadRequestException('Invalid outcome limit');
    await this.limit.consume('prediction-explorer', 60);
    return this.explore.predictions({ market: market as PredictionMarket, eventId, limit });
  }
}

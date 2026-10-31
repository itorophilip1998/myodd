import { Controller, Get } from '@nestjs/common';
import { RateLimitService } from '../common/rate-limit.service';
import { ModelLearningService } from './model-learning.service';

/** Public aggregates only. Forecast records, account IDs and booking codes never leave the API. */
@Controller('learning')
export class PerformanceController {
  constructor(private readonly learning: ModelLearningService, private readonly limit: RateLimitService) {}
  @Get('performance')
  async performance() {
    await this.limit.consume('prediction-performance', 60);
    return this.learning.performance();
  }
}

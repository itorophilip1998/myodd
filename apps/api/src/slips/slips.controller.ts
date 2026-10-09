import {
  Body,
  Controller,
  HttpCode,
  Post,
  BadRequestException,
} from '@nestjs/common';
import {
  analyzeSlipSchema,
  generateFromCodeSchema,
  generateFromPromptSchema,
} from '@myodd/shared';
import { SlipsService } from './slips.service';
import { RateLimitService } from '../common/rate-limit.service';

@Controller('slips')
export class SlipsController {
  constructor(
    private readonly slips: SlipsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post('analyze')
  @HttpCode(200)
  async analyze(@Body() body: unknown) {
    await this.rateLimit.consume('analyze', 30);
    const parsed = analyzeSlipSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.slips.analyze(parsed.data.bookingCode);
  }

  @Post('generate')
  @HttpCode(202)
  async generate(@Body() body: unknown) {
    await this.rateLimit.consume('generate', 10);
    const parsed = generateFromCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.slips.startGeneration({
      instruction: parsed.data.instruction,
      bookingCode: parsed.data.bookingCode,
    });
  }

  @Post('generate-from-prompt')
  @HttpCode(202)
  async generateFromPrompt(@Body() body: unknown) {
    await this.rateLimit.consume('generate', 10);
    const parsed = generateFromPromptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.slips.startGeneration({
      instruction: parsed.data.instruction,
    });
  }
}

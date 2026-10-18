import {
  Req, UseGuards,
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
import { ClerkGuard, type AuthRequest } from '../auth/auth.guard';
import { SlipsService } from './slips.service';
import { RateLimitService } from '../common/rate-limit.service';

@Controller('slips')
@UseGuards(ClerkGuard)
export class SlipsController {
  constructor(
    private readonly slips: SlipsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post('analyze')
  @HttpCode(200)
  async analyze(@Body() body: unknown, @Req() req: AuthRequest) {
    await this.rateLimit.consume('analyze', 30);
    const parsed = analyzeSlipSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.slips.analyze(parsed.data.bookingCode, !req.account);
  }

  @Post('generate')
  @HttpCode(202)
  async generate(@Body() body: unknown, @Req() req: AuthRequest) {
    await this.rateLimit.consume('generate', 10);
    const parsed = generateFromCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.slips.startGeneration({
      instruction: parsed.data.instruction,
      splitInto: parsed.data.splitInto,
      operation: parsed.data.operation,
      profileId: req.account?.id ?? parsed.data.profileId,
      userId: req.account?.id,
      ticketCount: parsed.data.ticketCount,
      gamesPerTicket: parsed.data.gamesPerTicket,
      matchDate: parsed.data.matchDate,
      minimumOdds: parsed.data.minimumOdds,
      maximumOdds: parsed.data.maximumOdds,
      bookingCode: parsed.data.bookingCode,
      pinnedSelections: parsed.data.pinnedSelections,
    });
  }

  @Post('generate-from-prompt')
  @HttpCode(202)
  async generateFromPrompt(@Body() body: unknown, @Req() req: AuthRequest) {
    await this.rateLimit.consume('generate', 10);
    const parsed = generateFromPromptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.slips.startGeneration({
      instruction: parsed.data.instruction,
      splitInto: parsed.data.splitInto,
      operation: parsed.data.operation,
      profileId: req.account?.id ?? parsed.data.profileId,
      userId: req.account?.id,
      ticketCount: parsed.data.ticketCount,
      gamesPerTicket: parsed.data.gamesPerTicket,
      matchDate: parsed.data.matchDate,
      minimumOdds: parsed.data.minimumOdds,
      maximumOdds: parsed.data.maximumOdds,
      pinnedSelections: parsed.data.pinnedSelections,
    });
  }
}

import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { CatalogService } from './catalog.service';
import { RateLimitService } from '../common/rate-limit.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService, private readonly limit: RateLimitService) {}
  @Get() summary() { return this.catalog.summary(); }
  @Post('import') @HttpCode(200)
  async importCode(@Body() body: unknown) {
    await this.limit.consume('catalog-import', 10);
    const parsed = z.object({ code: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Enter a valid SportyBet code');
    return this.catalog.importCode(parsed.data.code);
  }
  @Post('refresh') @HttpCode(202)
  async refresh() { await this.limit.consume('catalog-refresh', 2); return this.catalog.refresh(); }
}

import { BadRequestException, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ClerkGuard, SignedInGuard, type AuthRequest } from '../auth/auth.guard';
import { RateLimitService } from '../common/rate-limit.service';
import { CreatorsService } from './creators.service';
function pageNumber(input = '1') { const page = Number(input); if (!Number.isInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Invalid page'); return page; }
@Controller()
@UseGuards(ClerkGuard)
export class CreatorsController {
  constructor(private readonly creators: CreatorsService, private readonly rate: RateLimitService) {}
  @Get('creators') async discover(@Req() req: AuthRequest, @Query('search') search = '', @Query('page') page = '1') {
    if (search.length > 64) throw new BadRequestException('Search is too long');
    await this.rate.consume('creators', 60); return this.creators.discover(search.replace(/^@/, '').trim(), pageNumber(page), req.account?.id);
  }
  @Get('creators/:creatorId') async profile(@Param('creatorId') id: string, @Req() req: AuthRequest) { await this.rate.consume('creators', 60); return this.creators.profile(id, req.account?.id); }
  @Get('account/monitoring') @UseGuards(SignedInGuard)
  async monitoring(@Req() req: AuthRequest, @Query('page') page = '1') { return this.creators.monitoring(req.account!.id, pageNumber(page)); }
  @Post('account/monitoring/:creatorId') @UseGuards(SignedInGuard)
  async follow(@Param('creatorId') id: string, @Req() req: AuthRequest) { await this.rate.consume('follow-creator', 60); return this.creators.follow(id, req.account!.id); }
  @Delete('account/monitoring/:creatorId') @UseGuards(SignedInGuard)
  async unfollow(@Param('creatorId') id: string, @Req() req: AuthRequest) { return this.creators.unfollow(id, req.account!.id); }
}

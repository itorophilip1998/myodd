import { z } from 'zod';
import { Controller, Get, Post, Patch, Body, HttpCode, Param, Query, BadRequestException, Req, UseGuards } from '@nestjs/common';
import { ClerkGuard, SignedInGuard, type AuthRequest } from '../auth/auth.guard';
import { GroupsService } from './groups.service';
import { RateLimitService } from '../common/rate-limit.service';

@Controller()
@UseGuards(ClerkGuard)
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('groups')
  @UseGuards(SignedInGuard)
  async listGroups(@Req() req: AuthRequest, @Query('page') input?: string) {
    const page = Number(input ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Invalid history page');
    await this.rateLimit.consume('groups', 60);
    return this.groups.listRecent(page, req.account!.id);
  }

  @Get('groups/public')
  async publicGroups(@Req() req: AuthRequest, @Query('page') input = '1') {
    const page = Number(input);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Invalid history page');
    await this.rateLimit.consume('groups', 60);
    return this.groups.listPublic(page, req.account?.id);
  }

  @Patch('groups/:groupId') @UseGuards(SignedInGuard)
  async edit(@Param('groupId') id: string, @Req() req: AuthRequest, @Body() body: unknown) {
    const parsed = z.object({ title: z.string().trim().min(1).max(120).optional(), isPublic: z.boolean().optional() }).strict().refine(data => data.title !== undefined || data.isPublic !== undefined).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Provide a title or visibility');
    return this.groups.edit(id, req.account!.id, parsed.data);
  }

  @Get('groups/:groupId')
  async getGroup(@Param('groupId') groupId: string, @Req() req: AuthRequest) {
    await this.rateLimit.consume('groups', 60);
    return this.groups.getByPublicId(groupId, req.account?.id);
  }

  @Post('groups/:groupId/verify') @HttpCode(200)
  async verifyGroup(@Param('groupId') groupId: string, @Req() req: AuthRequest) {
    await this.rateLimit.consume('verify-group', 15);
    return this.groups.verifyGroup(groupId, req.account?.id);
  }
  @Post('codes/:code/verify') @HttpCode(200)
  async verifyCode(@Param('code') code: string, @Req() req: AuthRequest) {
    await this.rateLimit.consume('verify-code', 60);
    return this.groups.verifyCode(code, req.account?.id);
  }

  @Post('groups/:groupId/check-play') @HttpCode(200)
  async checkPlayGroup(@Param('groupId') groupId: string, @Req() req: AuthRequest) {
    await this.rateLimit.consume('check-play-group', 10);
    return this.groups.checkPlayGroup(groupId, req.account?.id);
  }

  @Post('checks/lookup') @HttpCode(200)
  async lookup(@Body() body: unknown, @Req() req: AuthRequest) {
    const parsed = z.object({ identifier: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Enter a valid booking code, ticket ID, or collection ID');
    await this.rateLimit.consume('check-play-lookup', 10);
    return this.groups.lookupAndCheck(parsed.data.identifier, req.account?.id);
  }

  @Post('codes/:code/check-play') @HttpCode(200)
  async checkPlayCode(@Param('code') code: string, @Req() req: AuthRequest) {
    await this.rateLimit.consume('check-play-code', 30);
    return this.groups.checkPlayCode(code, req.account?.id);
  }

  @Post('groups/:groupId/share') @HttpCode(200)
  publish(@Param('groupId') groupId: string, @Req() req: AuthRequest) { return this.groups.publish(groupId, req.account?.id); }

  @Get('codes/:code')
  async getCode(@Param('code') code: string, @Req() req: AuthRequest) {
    await this.rateLimit.consume('codes', 60);
    return this.groups.getSlipByCode(code, req.account?.id);
  }
}

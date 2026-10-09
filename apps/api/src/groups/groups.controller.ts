import { Controller, Get, Param } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { RateLimitService } from '../common/rate-limit.service';

@Controller()
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('groups/:groupId')
  async getGroup(@Param('groupId') groupId: string) {
    await this.rateLimit.consume('groups', 60);
    return this.groups.getByPublicId(groupId);
  }

  @Get('codes/:code')
  async getCode(@Param('code') code: string) {
    await this.rateLimit.consume('codes', 60);
    return this.groups.getSlipByCode(code);
  }
}

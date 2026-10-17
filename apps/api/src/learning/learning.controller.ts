import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ClerkGuard, type AuthRequest } from '../auth/auth.guard';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitService } from '../common/rate-limit.service';
import { canAccessGroup } from '../groups/group-access';
const id = z.string().uuid();
const feedback = z.object({ id, profileId: id, groupId: z.string().min(1).max(64), rating: z.enum(['helpful', 'needs_work']),
  note: z.string().max(2000).optional(), correctedPrompt: z.string().max(6000).optional(), rememberSettings: z.boolean().default(false) });

@Controller('learning')
@UseGuards(ClerkGuard)
export class LearningController {
  constructor(private readonly prisma: PrismaService, private readonly limit: RateLimitService) {}
  @Get('profiles/:profileId')
  async profile(@Param('profileId') profileId: string, @Req() req: AuthRequest) {
    if (!id.safeParse(profileId).success) throw new BadRequestException('Invalid preference profile');
    const accountOwner = await this.prisma.appUser.findUnique({ where: { id: profileId } });
    if (accountOwner && accountOwner.id !== req.account?.id) throw new NotFoundException('Profile not found');
    const profile = await this.prisma.learningProfile.findUnique({ where: { id: profileId } });
    return { preferences: profile?.preferences ?? null, revision: profile?.revision ?? 0 };
  }
  @Post('feedback')
  async record(@Body() body: unknown, @Req() req: AuthRequest) {
    await this.limit.consume('training-feedback', 30);
    const parsed = feedback.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid feedback');
    const data = { ...parsed.data, profileId: req.account?.id ?? parsed.data.profileId };
    if (!req.account && await this.prisma.appUser.findUnique({ where: { id: data.profileId } })) throw new NotFoundException('Profile not found');
    const group = await this.prisma.slipGroup.findUnique({ where: { publicId: data.groupId }, include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { slips: true } } } });
    if (!group || !canAccessGroup(group, req.account?.id)) throw new NotFoundException('Collection not found');
    const config = (group.generationReport as { effectiveConfig?: Record<string, unknown> } | null)?.effectiveConfig;
    if (data.rememberSettings && (data.rating !== 'helpful' || !config || group.jobs[0]?.status !== 'COMPLETED' || !group._count.slips)) throw new BadRequestException('Choose a completed useful result before saving defaults');
    return this.prisma.$transaction(async tx => {
      const prior = await tx.trainingFeedback.findUnique({ where: { id: data.id } });
      if (prior) return { saved: true, remembered: false };
      await tx.trainingFeedback.create({ data: { id: data.id, groupId: group.id, profileId: data.profileId, rating: data.rating, note: data.note, correctedPrompt: data.correctedPrompt } });
      await tx.trainingEvent.create({ data: { eventKey: `feedback-${data.id}`, groupId: group.id, profileId: data.profileId, kind: 'USER_FEEDBACK', payload: { ...data, effectiveConfig: config ?? null } as Prisma.InputJsonValue } });
      if (data.rememberSettings && config) {
        const preferences = { riskMode: config.riskMode ?? null, ticketCount: config.numberOfSlips ?? 10,
          gamesPerTicket: config.minimumSelections === config.maximumSelections ? config.minimumSelections : null } as Prisma.InputJsonValue;
        await tx.learningProfile.upsert({ where: { id: data.profileId }, create: { id: data.profileId, preferences },
          update: { preferences, revision: { increment: 1 } } });
      }
      return { saved: true, remembered: data.rememberSettings };
    });
  }
}

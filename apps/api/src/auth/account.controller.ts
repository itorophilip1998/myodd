import { normalizeLearnedPreferences } from '../learning/preferences';
import { createClerkClient } from '@clerk/backend';
import { Controller, Get, Post, Delete, Param, Req, UseGuards, NotFoundException, Query, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { collectionSaveSchema, uiSettingsSchema, normalizeUiSettings } from '@myodd/shared';
import { Prisma } from '@prisma/client';
import { Patch } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRequest, ClerkGuard, SignedInGuard } from './auth.guard';
@Controller('account')
@UseGuards(ClerkGuard, SignedInGuard)
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}
  @Post('sync') async sync(@Req() req: AuthRequest) {
    let user = req.account!;
    if (!user.profileSyncedAt || Date.now() - user.profileSyncedAt.getTime() > 3600000) {
      try {
        // Only the authenticated account's verified Clerk username is published.
        const profile = await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }).users.getUser(user.clerkId);
        user = await this.prisma.appUser.update({ where: { id: user.id }, data: { username: profile.username ?? null, profileSyncedAt: new Date() } });
      } catch { /* Account saves remain available while profile metadata is offline. */ }
    }
    return { id: user.id, publicId: user.publicId, username: user.username, createdAt: user.createdAt, synced: true };
  }
  @Get('preferences') async preferences(@Req() req: AuthRequest) {
    const row = await this.prisma.learningProfile.findUnique({ where: { id: req.account!.id } });
    return { preferences: normalizeLearnedPreferences(row?.preferences), revision: row?.revision ?? 0 };
  }
  @Get('legacy') async legacy(@Req() req: AuthRequest, @Query('page') input = '1') {
    const page = Math.max(1, Math.min(1000, Number.parseInt(input, 10) || 1));
    const rows = await this.prisma.slipGroup.findMany({ where: { isLegacy: true, isPublic: true, deletedAt: null, ownerId: null },
      take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { publicId: true, title: true, createdAt: true, _count: { select: { slips: true } }, savedBy: { where: { userId: req.account!.id, hiddenAt: null }, select: { userId: true } } } });
    return rows.map(row => ({ publicId: row.publicId, title: row.title, createdAt: row.createdAt, slipCount: row._count.slips, saved: row.savedBy.length > 0 }));
  }
  @Get('settings') async settings(@Req() req: AuthRequest) {
    const user = await this.prisma.appUser.findUniqueOrThrow({ where: { id: req.account!.id }, select: { uiSettings: true } });
    return { settings: user.uiSettings ? normalizeUiSettings(user.uiSettings) : null };
  }
  @Patch('settings') async updateSettings(@Req() req: AuthRequest, @Body() body: unknown) {
    const patch = uiSettingsSchema.partial().safeParse(body);
    if (!patch.success) throw new BadRequestException('Invalid settings');
    return this.prisma.$transaction(async tx => {
      // Serialize concurrent device updates without dropping unrelated preferences.
      await tx.$queryRaw`SELECT id FROM app_users WHERE id = ${req.account!.id} FOR UPDATE`;
      const user = await tx.appUser.findUniqueOrThrow({ where: { id: req.account!.id } });
      const settings = normalizeUiSettings({ ...(user.uiSettings as object ?? {}), ...patch.data });
      await tx.appUser.update({ where: { id: user.id }, data: { uiSettings: settings as Prisma.InputJsonValue } });
      return { settings };
    });
  }
  @Post('saves/:publicId') async save(@Param('publicId') publicId: string, @Req() req: AuthRequest, @Body() body: unknown = {}) {
    const parsed = collectionSaveSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Provide a collection title of 1–120 characters and valid visibility');
    const userId = req.account!.id;
    const group = await this.prisma.slipGroup.findFirst({
      where: { publicId, OR: [{ ownerId: userId }, { ownerId: null, deletedAt: null }] },
    });
    if (!group) throw new NotFoundException('Collection not found');
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.slipGroup.updateMany({
        where: { id: group.id, OR: [{ ownerId: userId }, { ownerId: null, deletedAt: null }] },
        data: {
          userSaved: true,
          deletedAt: null,
          ...(group.ownerId ? {} : { ownerId: userId }),
          ...parsed.data,
        },
      });
      if (claimed.count !== 1) throw new NotFoundException('Collection not found');
      await tx.savedCollection.upsert({ where: { userId_groupId: { userId, groupId: group.id } }, create: { userId, groupId: group.id }, update: { hiddenAt: null } });
      await tx.trainingEvent.create({ data: { groupId: group.id, profileId: userId, kind: 'COLLECTION_SAVED', payload: { publicId } } });
    });
    return { saved: true, userSaved: true };
  }
  @Post('collections/remove') async remove(@Body() body: unknown, @Req() req: AuthRequest) {
    const parsed = z.object({ publicIds: z.array(z.string().min(1).max(100)).min(1).max(100) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Select 1–100 collections');
    const userId = req.account!.id;
    return this.prisma.$transaction(async tx => {
      const groups = await tx.slipGroup.findMany({ where: { publicId: { in: [...new Set(parsed.data.publicIds)] }, ownerId: userId }, select: { id: true, publicId: true, ownerId: true } });
      for (const group of groups) {
        await tx.slipGroup.update({ where: { id: group.id }, data: { deletedAt: new Date(), isPublic: false } });
        await tx.savedCollection.upsert({ where: { userId_groupId: { userId, groupId: group.id } },
        create: { userId, groupId: group.id, hiddenAt: new Date() }, update: { hiddenAt: new Date() } });
      }
      if (groups.length) await tx.trainingEvent.create({ data: { kind: 'COLLECTIONS_REMOVED', profileId: userId, payload: { publicIds: groups.map(g => g.publicId) } } });
      return { removed: groups.map(g => g.publicId) };
    });
  }
  @Delete('saves/:publicId') async unsave(@Param('publicId') publicId: string, @Req() req: AuthRequest) {
    await this.remove({ publicIds: [publicId] }, req);
    return { saved: false };
  }
}

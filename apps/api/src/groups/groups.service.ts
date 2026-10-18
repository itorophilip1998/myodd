import { creatorLabel, creatorSelect } from '../creators/creators.service';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessGroup } from './group-access';
import { PlayCheckService } from './play-check.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly playCheck: PlayCheckService,
  ) {}

  async listRecent(page = 1, userId: string) {
    const groups = await this.prisma.slipGroup.findMany({
      where: {
        deletedAt: null,
        userSaved: true,
        ownerId: userId,
        savedBy: { none: { userId, hiddenAt: { not: null } } },
      },
      take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { publicId: true, title: true, createdAt: true, originalBookingCode: true,
        isPublic: true, ownerId: true, owner: { select: creatorSelect }, _count: { select: { slips: true } } },
    });
    return groups.map(group => ({ publicId: group.publicId, title: group.title,
      createdAt: group.createdAt.toISOString(), originalBookingCode: group.originalBookingCode,
      creator: group.owner ? creatorLabel(group.owner) : null, slipCount: group._count.slips, isPublic: group.isPublic, isOwner: group.ownerId === userId, saved: true }));
  }

  async listPublic(page = 1, userId?: string) {
    const rows = await this.prisma.slipGroup.findMany({ where: { isPublic: true, userSaved: true, deletedAt: null, slips: { some: {} } },
      take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { publicId: true, title: true, createdAt: true, originalBookingCode: true, ownerId: true, owner: { select: creatorSelect },
        _count: { select: { slips: true } } } });
    return rows.map(g => ({ publicId: g.publicId, title: g.title, createdAt: g.createdAt.toISOString(),
      creator: g.owner ? creatorLabel(g.owner) : null, originalBookingCode: g.originalBookingCode, slipCount: g._count.slips, isPublic: true, isOwner: !!userId && g.ownerId === userId,
      saved: !!userId && g.ownerId === userId }));
  }

  async getByPublicId(publicId: string, userId?: string) {
    const group = await this.prisma.slipGroup.findUnique({
      where: { publicId },
      include: {
        owner: { select: creatorSelect },
        jobs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, updatedAt: true, status: true, stage: true, stageDetail: true, failedCount: true, error: true, progress: true, total: true } },
        slips: {
          include: { selections: true },
          orderBy: [{ rankOrder: 'asc' }, { slipScore: 'desc' }, { totalOdds: 'asc' }],
        },
      },
    });
    if (!canAccessGroup(group, userId)) throw new NotFoundException('Collection not found');

    const availability = await this.catalog.displayStatus(group.slips.map(s => s.bookingCode));
    const slips = group.slips.map((s) => {
      const code = s.bookingCode.toUpperCase();
      const displayStatus = availability.statuses.get(code)
        ?? (availability.valid.has(code) ? 'ACTIVE' : 'UNKNOWN');
      return {
        id: s.id,
        bookingCode: s.bookingCode,
        shareUrl: s.shareUrl,
        totalOdds: s.totalOdds,
        confidence: s.confidence,
        riskLevel: s.riskLevel,
        selectionCount: s.selectionCount,
        rankOrder: s.rankOrder,
        slipScore: s.slipScore,
        playStatus: s.playStatus,
        playCheckedAt: s.playCheckedAt?.toISOString() ?? null,
        openLegs: s.openLegs,
        liveLegs: s.liveLegs,
        playedLegs: s.playedLegs,
        cutLegs: s.cutLegs,
        cutSummary: s.cutSummary,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        displayStatus,
        selections: s.selections.map((sel) => ({
          homeTeam: sel.homeTeam,
          awayTeam: sel.awayTeam,
          league: sel.league,
          marketName: sel.marketName,
          selectionName: sel.selectionName,
          odds: sel.odds,
          predictionProbability: sel.predictionProbability,
          predictionScore: sel.predictionScore,
          modelVersion: sel.modelVersion,
          kickoffAt: sel.kickoffAt?.toISOString() ?? null,
          playStatus: sel.playStatus,
          score: sel.score,
          playNote: sel.playNote,
        })),
      };
    });

    const bookmark = userId ? await this.prisma.savedCollection.findUnique({ where: { userId_groupId: { userId, groupId: group.id } } }) : null;
    const saved = group.userSaved && ((!!bookmark && !bookmark.hiddenAt) || (!!userId && group.ownerId === userId && !bookmark?.hiddenAt));
    return {
      saved,
      userSaved: group.userSaved,
      id: group.id,
      creator: group.owner ? creatorLabel(group.owner) : null,
      publicId: group.publicId,
      isOwner: !!userId && group.ownerId === userId, isPublic: group.isPublic,
      title: group.title,
      description: group.description,
      createdAt: group.createdAt.toISOString(),
      expiresAt: group.expiresAt?.toISOString() ?? null,
      originalBookingCode: group.originalBookingCode,
      generationReport: group.generationReport,
      job: group.jobs[0] ?? null,
      availability: {
        saved: group.slips.length,
        active: availability.valid.size,
        checking: availability.checking,
        unavailable: availability.unavailable,
      },
      slips,
      counts: {
        lower: slips.filter((s) => s.riskLevel === 'LOWER').length,
        moderate: slips.filter((s) => s.riskLevel === 'MODERATE').length,
        higher: slips.filter((s) => s.riskLevel === 'HIGHER').length,
      },
    };
  }

  async verifyGroup(publicId: string, userId?: string) {
    const group = await this.prisma.slipGroup.findUnique({ where: { publicId }, include: { slips: true } });
    if (!group || !canAccessGroup(group, userId)) throw new NotFoundException('Collection not found');
    const availability = await this.catalog.verifyCodes([...new Set(group.slips.map(s => s.bookingCode))]);
    const play = await this.playCheck.checkSlips(group.slips.map(s => s.id));
    return {
      ...availability,
      play: this.playCheck.summarize(play),
      slips: play,
    };
  }
  async verifyCode(code: string, userId?: string) {
    const slip = await this.prisma.generatedSlip.findFirst({
      where: { bookingCode: code.toUpperCase(), group: { deletedAt: null } },
      include: { group: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!slip || !canAccessGroup(slip.group, userId)) throw new NotFoundException('Code not found');
    const availability = await this.catalog.verifyCodes([slip.bookingCode]);
    const [play] = await this.playCheck.checkSlips([slip.id]);
    return {
      ...availability,
      play,
    };
  }

  async saveForUser(publicId: string, userId: string) {
    const group = await this.prisma.slipGroup.findUnique({ where: { publicId } });
    if (!group || !canAccessGroup(group, userId)) throw new NotFoundException('Collection not found');
    await this.prisma.$transaction(async tx => {
      await tx.slipGroup.update({
        where: { id: group.id },
        data: {
          userSaved: true,
          deletedAt: null,
          ...(group.ownerId ? {} : { ownerId: userId }),
        },
      });
      await tx.savedCollection.upsert({
        where: { userId_groupId: { userId, groupId: group.id } },
        create: { userId, groupId: group.id },
        update: { hiddenAt: null },
      });
      await tx.trainingEvent.create({
        data: { groupId: group.id, profileId: userId, kind: 'COLLECTION_SAVED', payload: { publicId, savedAt: new Date().toISOString() } },
      });
    });
    return { saved: true, userSaved: true, publicId };
  }

  async publish(publicId: string, userId?: string) {
    const group = await this.prisma.slipGroup.findUnique({ where: { publicId } });
    if (!group || !canAccessGroup(group, userId)) throw new NotFoundException('Collection not found');
    if (!userId || (group.ownerId && group.ownerId !== userId)) throw new NotFoundException('Collection not found');
    await this.prisma.slipGroup.update({
      where: { id: group.id },
      data: { isPublic: true, userSaved: true, ownerId: group.ownerId ?? userId, deletedAt: null },
    });
    return { publicId, isPublic: true, userSaved: true };
  }

  async edit(publicId: string, ownerId: string, changes: { title?: string; isPublic?: boolean }) {
    return this.prisma.$transaction(async tx => {
      const group = await tx.slipGroup.findFirst({ where: { publicId, ownerId, deletedAt: null } });
      if (!group) throw new NotFoundException('Collection not found');
      const data = {
        ...changes,
        ...(changes.isPublic ? { userSaved: true } : {}),
      };
      const updated = await tx.slipGroup.update({ where: { id: group.id, ownerId }, data });
      await tx.trainingEvent.create({ data: { groupId: group.id, profileId: ownerId, kind: 'COLLECTION_UPDATED', payload: changes } });
      return { publicId: updated.publicId, title: updated.title, isPublic: updated.isPublic, userSaved: updated.userSaved };
    });
  }

  async getSlipByCode(code: string, userId?: string) {
    const slip = await this.prisma.generatedSlip.findFirst({
      where: { bookingCode: code.toUpperCase(), group: { deletedAt: null } },
      include: { selections: true, group: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!slip || !canAccessGroup(slip.group, userId)) throw new NotFoundException('Slip not found');
    const availability = await this.catalog.displayStatus([slip.bookingCode]);
    const displayStatus = availability.statuses.get(slip.bookingCode.toUpperCase()) ?? 'UNKNOWN';
    return {
      id: slip.id,
      bookingCode: slip.bookingCode,
      shareUrl: slip.shareUrl,
      totalOdds: slip.totalOdds,
      confidence: slip.confidence,
      riskLevel: slip.riskLevel,
      selectionCount: slip.selectionCount,
      playStatus: slip.playStatus,
      playCheckedAt: slip.playCheckedAt?.toISOString() ?? null,
      openLegs: slip.openLegs,
      liveLegs: slip.liveLegs,
      playedLegs: slip.playedLegs,
      cutLegs: slip.cutLegs,
      cutSummary: slip.cutSummary,
      expiresAt: slip.expiresAt?.toISOString() ?? null,
      displayStatus,
      groupPublicId: slip.group.publicId,
      selections: slip.selections.map((sel) => ({
        homeTeam: sel.homeTeam,
        awayTeam: sel.awayTeam,
        league: sel.league,
        marketName: sel.marketName,
        selectionName: sel.selectionName,
        odds: sel.odds,
        predictionProbability: sel.predictionProbability,
        predictionScore: sel.predictionScore,
        modelVersion: sel.modelVersion,
        kickoffAt: sel.kickoffAt?.toISOString() ?? null,
        playStatus: sel.playStatus,
        score: sel.score,
        playNote: sel.playNote,
      })),
    };
  }

}

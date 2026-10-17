import { creatorLabel, creatorSelect } from '../creators/creators.service';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService, private readonly catalog: CatalogService) {}

  async listRecent(page = 1, userId: string) {
    const groups = await this.prisma.slipGroup.findMany({
      where: { deletedAt: null, OR: [{ ownerId: userId, savedBy: { none: { userId, hiddenAt: { not: null } } } }, { isPublic: true, savedBy: { some: { userId, hiddenAt: null } } }] },
      take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { publicId: true, title: true, createdAt: true, originalBookingCode: true,
        isPublic: true, ownerId: true, owner: { select: { ...creatorSelect, followers: { where: { followerId: userId }, select: { followerId: true } } } }, _count: { select: { slips: true } } },
    });
    return groups.map(group => ({ publicId: group.publicId, title: group.title,
      createdAt: group.createdAt.toISOString(), originalBookingCode: group.originalBookingCode,
      creator: group.owner ? { ...creatorLabel(group.owner), following: !!group.owner.followers.length } : null, slipCount: group._count.slips, isPublic: group.isPublic, isOwner: group.ownerId === userId, saved: true }));
  }


  async listPublic(page = 1, userId?: string, creatorPublicId?: string, followingOnly = false) {
    const rows = await this.prisma.slipGroup.findMany({ where: { isPublic: true, deletedAt: null, slips: { some: {} }, ...(creatorPublicId ? { owner: { publicId: creatorPublicId } } : followingOnly ? { owner: { followers: { some: { followerId: userId! } } } } : {}) },
      take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { publicId: true, title: true, createdAt: true, originalBookingCode: true, ownerId: true, owner: { select: { ...creatorSelect, followers: { where: { followerId: userId ?? '__anonymous__' }, select: { followerId: true } } } },
        _count: { select: { slips: true } }, savedBy: { where: { userId: userId ?? '__anonymous__' }, select: { hiddenAt: true } } } });
    return rows.map(g => ({ publicId: g.publicId, title: g.title, createdAt: g.createdAt.toISOString(),
      creator: g.owner ? { ...creatorLabel(g.owner), following: !!g.owner.followers.length } : null, originalBookingCode: g.originalBookingCode, slipCount: g._count.slips, isPublic: true, isOwner: !!userId && g.ownerId === userId,
      saved: g.savedBy.some(s => !s.hiddenAt) || (!!userId && g.ownerId === userId && !g.savedBy.some(s => !!s.hiddenAt)) }));
  }

  async getByPublicId(publicId: string, userId?: string) {
    const group = await this.prisma.slipGroup.findUnique({
      where: { publicId },
      include: {
        owner: { select: creatorSelect },
        jobs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, updatedAt: true, status: true, stage: true, stageDetail: true, failedCount: true, error: true, progress: true, total: true } },
        slips: {
          include: { selections: true },
          orderBy: [{ riskLevel: 'asc' }, { totalOdds: 'asc' }],
        },
      },
    });
    if (!group || group.deletedAt || (!group.isPublic && group.ownerId !== userId)) throw new NotFoundException('Collection not found');

    const availability = await this.catalog.displayStatus(group.slips.map(s => s.bookingCode));
    const slips = group.slips.filter(s => availability.valid.has(s.bookingCode.toUpperCase())).map((s) => ({
      id: s.id,
      bookingCode: s.bookingCode,
      shareUrl: s.shareUrl,
      totalOdds: s.totalOdds,
      confidence: s.confidence,
      riskLevel: s.riskLevel,
      selectionCount: s.selectionCount,
      expiresAt: s.expiresAt?.toISOString() ?? null,
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
      })),
    }));

    const saved = userId ? await this.prisma.savedCollection.findUnique({ where: { userId_groupId: { userId, groupId: group.id } } }) : null;
    return {
      saved: (!!saved && !saved.hiddenAt) || (!!userId && group.ownerId === userId && !saved?.hiddenAt),
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
      availability: { saved: group.slips.length, checking: availability.checking, unavailable: availability.unavailable },
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
    if (!group || group.deletedAt || (!group.isPublic && group.ownerId !== userId)) throw new NotFoundException('Collection not found');
    return this.catalog.verifyCodes([...new Set(group.slips.map(s => s.bookingCode))]);
  }
  async verifyCode(code: string, userId?: string) {
    const slip = await this.prisma.generatedSlip.findFirst({ where: { bookingCode: code.toUpperCase(), group: { deletedAt: null, OR: [{ isPublic: true }, ...(userId ? [{ ownerId: userId }] : [])] } } });
    if (!slip) throw new NotFoundException('Code not found');
    return this.catalog.verifyCodes([slip.bookingCode]);
  }

  async publish(publicId: string, userId?: string) {
    const group = await this.prisma.slipGroup.findUnique({ where: { publicId } });
    if (!group || group.deletedAt || (!group.isPublic && group.ownerId !== userId)) throw new NotFoundException('Collection not found');
    if (!group.isPublic) await this.prisma.slipGroup.update({ where: { id: group.id, ownerId: userId }, data: { isPublic: true } });
    return { publicId, isPublic: true };
  }

  async edit(publicId: string, ownerId: string, changes: { title?: string; isPublic?: boolean }) {
    return this.prisma.$transaction(async tx => {
      const group = await tx.slipGroup.findFirst({ where: { publicId, ownerId, deletedAt: null } });
      if (!group) throw new NotFoundException('Collection not found');
      const updated = await tx.slipGroup.update({ where: { id: group.id, ownerId }, data: changes });
      await tx.trainingEvent.create({ data: { groupId: group.id, profileId: ownerId, kind: 'COLLECTION_UPDATED', payload: changes } });
      return { publicId: updated.publicId, title: updated.title, isPublic: updated.isPublic };
    });
  }

  async getSlipByCode(code: string, userId?: string) {
    const slip = await this.prisma.generatedSlip.findFirst({
      where: { bookingCode: code.toUpperCase(), group: { deletedAt: null, OR: [{ isPublic: true }, ...(userId ? [{ ownerId: userId }] : [])] } },
      include: { selections: true, group: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!slip) throw new NotFoundException('Slip not found');
    const checked = await this.catalog.verifyCodes([slip.bookingCode]);
    if (!checked.codes.length) throw new NotFoundException('This ticket is no longer available. Generate a fresh collection.');
    return {
      id: slip.id,
      bookingCode: slip.bookingCode,
      shareUrl: slip.shareUrl,
      totalOdds: slip.totalOdds,
      confidence: slip.confidence,
      riskLevel: slip.riskLevel,
      selectionCount: slip.selectionCount,
      expiresAt: slip.expiresAt?.toISOString() ?? null,
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
      })),
    };
  }

}

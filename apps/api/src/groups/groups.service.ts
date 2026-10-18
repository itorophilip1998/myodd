import { modeKeyFromLabel, type ModeKey } from '@myodd/shared';
import { creatorLabel, creatorSelect } from '../creators/creators.service';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessGroup } from './group-access';
import { PlayCheckService } from './play-check.service';

const MODE_KEYS = new Set(['INVESTOR', 'GAMBLER', 'JAPA', 'LAGOS_LIFE']);

function resolveRiskMode(generationReport: unknown, description?: string | null): ModeKey | null {
  const report = generationReport as { effectiveConfig?: { riskMode?: string | null } } | null;
  const fromConfig = report?.effectiveConfig?.riskMode ?? null;
  if (fromConfig && MODE_KEYS.has(fromConfig)) return fromConfig as ModeKey;
  return modeKeyFromLabel(description) ?? modeKeyFromLabel(fromConfig);
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly playCheck: PlayCheckService,
  ) {}

  private collectionPlay(slips?: Array<{ playStatus: string; playCheckedAt: Date | null; cutLegs: number; openLegs: number; liveLegs: number; playedLegs: number }> | null) {
    if (!slips?.length) {
      return { playResult: 'UNKNOWN' as const, playCheckedAt: null as string | null, done: 0, open: 0, live: 0 };
    }
    const summary = this.playCheck.summarize(slips.map(s => ({
      playStatus: s.playStatus as 'OPEN' | 'LIVE' | 'CUT' | 'ALL_PLAYED' | 'UNKNOWN',
      cutLegs: s.cutLegs, openLegs: s.openLegs, liveLegs: s.liveLegs, playedLegs: s.playedLegs,
    })));
    const checked = slips.some(s => s.playCheckedAt);
    let playResult: 'DONE' | 'LIVE' | 'OPEN' | 'UNKNOWN' = 'UNKNOWN';
    if (!checked && summary.unknown === slips.length) playResult = 'UNKNOWN';
    else if (summary.live > 0) playResult = 'LIVE';
    else if (summary.open > 0) playResult = 'OPEN';
    else if (summary.done === slips.length) playResult = 'DONE';
    else if (summary.done > 0) playResult = 'DONE';
    else if (checked) playResult = 'UNKNOWN';
    const latest = slips.reduce<Date | null>((max, s) => {
      if (!s.playCheckedAt) return max;
      if (!max || s.playCheckedAt > max) return s.playCheckedAt;
      return max;
    }, null);
    return {
      playResult,
      playCheckedAt: latest?.toISOString() ?? null,
      done: summary.done,
      open: summary.open,
      live: summary.live,
    };
  }

  async listRecent(page = 1, userId: string) {
    const groups = await this.prisma.slipGroup.findMany({
      where: {
        deletedAt: null,
        userSaved: true,
        ownerId: userId,
        savedBy: { none: { userId, hiddenAt: { not: null } } },
      },
      take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        publicId: true, title: true, createdAt: true, originalBookingCode: true, description: true,
        generationReport: true, isPublic: true, ownerId: true, owner: { select: creatorSelect },
        _count: { select: { slips: true } },
        slips: { select: { playStatus: true, playCheckedAt: true, cutLegs: true, openLegs: true, liveLegs: true, playedLegs: true } },
      },
    });
    return groups.map(group => {
      const play = this.collectionPlay(group.slips);
      return {
        publicId: group.publicId, title: group.title,
        createdAt: group.createdAt.toISOString(), originalBookingCode: group.originalBookingCode,
        creator: group.owner ? creatorLabel(group.owner) : null, slipCount: group._count.slips,
        isPublic: group.isPublic, isOwner: group.ownerId === userId, saved: true,
        riskMode: resolveRiskMode(group.generationReport, group.description),
        ...play,
      };
    });
  }

  async listPublic(page = 1, userId?: string) {
    const rows = await this.prisma.slipGroup.findMany({ where: { isPublic: true, userSaved: true, deletedAt: null, slips: { some: {} } },
      take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        publicId: true, title: true, createdAt: true, originalBookingCode: true, description: true,
        generationReport: true, ownerId: true, owner: { select: creatorSelect },
        _count: { select: { slips: true } },
        slips: { select: { playStatus: true, playCheckedAt: true, cutLegs: true, openLegs: true, liveLegs: true, playedLegs: true } },
      } });
    return rows.map(g => {
      const play = this.collectionPlay(g.slips);
      return {
        publicId: g.publicId, title: g.title, createdAt: g.createdAt.toISOString(),
        creator: g.owner ? creatorLabel(g.owner) : null, originalBookingCode: g.originalBookingCode, slipCount: g._count.slips,
        isPublic: true, isOwner: !!userId && g.ownerId === userId,
        saved: !!userId && g.ownerId === userId,
        riskMode: resolveRiskMode(g.generationReport, g.description),
        ...play,
      };
    });
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
    const riskMode = resolveRiskMode(group.generationReport, group.description);
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
        riskMode,
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
      riskMode,
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
      playSummary: this.playCheck.summarize(group.slips),
      slips,
      counts: {
        lower: slips.filter((s) => s.riskLevel === 'LOWER').length,
        moderate: slips.filter((s) => s.riskLevel === 'MODERATE').length,
        higher: slips.filter((s) => s.riskLevel === 'HIGHER').length,
      },
    };
  }

  async checkPlayGroup(publicId: string, userId?: string) {
    const group = await this.prisma.slipGroup.findUnique({
      where: { publicId },
      include: { slips: { select: { id: true } } },
    });
    if (!group || !canAccessGroup(group, userId)) throw new NotFoundException('Collection not found');
    if (!group.userSaved && !(userId && group.ownerId === userId)) {
      throw new NotFoundException('Save this collection before verifying play results');
    }
    const slips = await this.playCheck.checkSlips(group.slips.map(s => s.id));
    return { publicId, isPublic: group.isPublic, slips, summary: this.playCheck.summarize(slips) };
  }

  async checkPlayCode(code: string, userId?: string) {
    const slip = await this.prisma.generatedSlip.findFirst({
      where: { bookingCode: code.toUpperCase(), group: { deletedAt: null } },
      include: { group: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!slip || !canAccessGroup(slip.group, userId)) throw new NotFoundException('Code not found');
    if (!slip.group.userSaved && !(userId && slip.group.ownerId === userId)) {
      throw new NotFoundException('Save this collection before verifying play results');
    }
    const [result] = await this.playCheck.checkSlips([slip.id]);
    return { ...result, summary: this.playCheck.summarize([result]) };
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
    const riskMode = resolveRiskMode(slip.group.generationReport, slip.group.description);
    const isOwner = !!userId && slip.group.ownerId === userId;
    return {
      id: slip.id,
      bookingCode: slip.bookingCode,
      shareUrl: slip.shareUrl,
      totalOdds: slip.totalOdds,
      confidence: slip.confidence,
      riskLevel: slip.riskLevel,
      riskMode,
      selectionCount: slip.selectionCount,
      playStatus: slip.playStatus,
      playCheckedAt: slip.playCheckedAt?.toISOString() ?? null,
      openLegs: slip.openLegs,
      liveLegs: slip.liveLegs,
      playedLegs: slip.playedLegs,
      cutLegs: slip.cutLegs,
      cutSummary: slip.cutSummary,
      expiresAt: slip.expiresAt?.toISOString() ?? null,
      createdAt: slip.createdAt.toISOString(),
      displayStatus,
      groupPublicId: slip.group.publicId,
      userSaved: slip.group.userSaved,
      isOwner,
      isPublic: slip.group.isPublic,
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

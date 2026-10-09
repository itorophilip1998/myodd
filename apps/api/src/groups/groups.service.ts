import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroupsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(
      () => {
        void this.cleanupExpired();
      },
      60 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async getByPublicId(publicId: string) {
    const group = await this.prisma.slipGroup.findUnique({
      where: { publicId },
      include: {
        slips: {
          include: { selections: true },
          orderBy: [{ riskLevel: 'asc' }, { totalOdds: 'asc' }],
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');

    const slips = group.slips.map((s) => ({
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
        kickoffAt: sel.kickoffAt?.toISOString() ?? null,
      })),
    }));

    return {
      id: group.id,
      publicId: group.publicId,
      title: group.title,
      description: group.description,
      createdAt: group.createdAt.toISOString(),
      expiresAt: group.expiresAt?.toISOString() ?? null,
      originalBookingCode: group.originalBookingCode,
      slips,
      counts: {
        lower: slips.filter((s) => s.riskLevel === 'LOWER').length,
        moderate: slips.filter((s) => s.riskLevel === 'MODERATE').length,
        higher: slips.filter((s) => s.riskLevel === 'HIGHER').length,
      },
    };
  }

  async getSlipByCode(code: string) {
    const slip = await this.prisma.generatedSlip.findFirst({
      where: { bookingCode: code.toUpperCase() },
      include: { selections: true, group: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!slip) throw new NotFoundException('Slip not found');
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
        kickoffAt: sel.kickoffAt?.toISOString() ?? null,
      })),
    };
  }

  async cleanupExpired() {
    const now = new Date();
    const deleted = await this.prisma.slipGroup.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    if (deleted.count > 0) {
      this.logger.log(`Cleaned up ${deleted.count} expired groups`);
    }
  }
}

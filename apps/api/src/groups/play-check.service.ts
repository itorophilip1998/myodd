import { Inject, Injectable, Logger } from '@nestjs/common';
import { SlipPlayStatus } from '@prisma/client';
import {
  settlementKey,
  type BookmakerBooking,
  type BookmakerFixture,
  type LiveFixture,
  type SelectionSettlement,
} from '@myodd/shared';
import { BOOKMAKER_PROVIDER, type BookmakerProvider } from '../bookmaker/bookmaker.provider';
import { SportyBetSettlementService } from '../bookmaker/sportybet.settlement';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { decideLegPlayStatus, isDoneLeg, isDoneSlip, matchPhase } from './play-leg-status';

type LegInput = {
  id: string;
  sportyEventId: string;
  marketId: string;
  outcomeId: string;
  specifier: string;
  kickoffAt: Date | null;
  homeTeam?: string;
  awayTeam?: string;
  league?: string;
  marketName?: string;
  selectionName?: string;
};

function matchLabel(leg: LegInput) {
  const home = leg.homeTeam?.trim() || 'Home';
  const away = leg.awayTeam?.trim() || 'Away';
  return `${home} vs ${away}`;
}

function pickLabel(leg: LegInput) {
  const market = leg.marketName?.trim() || 'Market';
  const selection = leg.selectionName?.trim() || 'Selection';
  return `${market}: ${selection}`;
}

@Injectable()
export class PlayCheckService {
  private readonly logger = new Logger(PlayCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly settlement: SportyBetSettlementService,
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
  ) {}

  async checkSlips(slipIds: string[]) {
    const slips = await this.prisma.generatedSlip.findMany({
      where: { id: { in: slipIds } },
      include: { selections: true },
    });
    const live = await this.bookmaker.getLiveFixtures().catch(() => [] as LiveFixture[]);
    const results = [];
    for (const slip of slips) {
      results.push(await this.checkOne(slip.id, slip.bookingCode, slip.selections, live));
    }
    return results;
  }

  async checkOne(slipId: string, bookingCode: string, selections: LegInput[], liveFixtures?: LiveFixture[]) {
    const verified = await this.catalog.validate(bookingCode.toUpperCase()).catch(() => null);
    const booking = (verified?.snapshot as unknown as BookmakerBooking | null) ?? null;
    const eventIds = [...new Set(selections.map(s => s.sportyEventId).filter(Boolean))];
    const [fixtures, live] = await Promise.all([
      eventIds.length ? this.bookmaker.getFixtures({ eventIds }).catch(() => [] as BookmakerFixture[]) : Promise.resolve([] as BookmakerFixture[]),
      liveFixtures ? Promise.resolve(liveFixtures) : this.bookmaker.getLiveFixtures().catch(() => [] as LiveFixture[]),
    ]);
    const byEvent = new Map<string, BookmakerFixture | LiveFixture>();
    for (const f of fixtures) byEvent.set(f.eventId, f);
    for (const f of live) byEvent.set(f.eventId, f);

    const needsScrape = selections.some(leg => {
      const kickoff = leg.kickoffAt?.getTime() ?? null;
      const fixture = byEvent.get(leg.sportyEventId);
      const phase = matchPhase({ kickoffMs: kickoff, nowMs: Date.now(), matchStatus: fixture?.matchStatus });
      const bookSel = findBookingSelection(booking, leg);
      const settlement = bookSel?.settlement ?? 'UNKNOWN';
      return (phase === 'finished' || phase === 'unknown') && (settlement === 'UNKNOWN' || settlement === 'PENDING');
    });

    let scraped = new Map<string, SelectionSettlement>();
    if (needsScrape) {
      scraped = await this.settlement.fetchShareSettlement(bookingCode).catch(err => {
        this.logger.warn(`Settlement scrape skipped for ${bookingCode}: ${(err as Error).message}`);
        return new Map<string, SelectionSettlement>();
      });
    }

    const now = Date.now();
    let openLegs = 0, liveLegs = 0, doneLegs = 0;

    for (const leg of selections) {
      const kickoff = leg.kickoffAt?.getTime() ?? null;
      const fixture = byEvent.get(leg.sportyEventId);
      const bookSel = findBookingSelection(booking, leg);
      const unavailable = booking?.unavailableOutcomes?.some(s =>
        s.eventId === leg.sportyEventId
        && s.marketId === leg.marketId
        && s.outcomeId === leg.outcomeId) ?? false;
      const phase = matchPhase({
        kickoffMs: kickoff,
        nowMs: now,
        matchStatus: fixture?.matchStatus,
      });
      const key = settlementKey({
        eventId: leg.sportyEventId,
        marketId: leg.marketId,
        outcomeId: leg.outcomeId,
        specifier: leg.specifier ?? '',
      });
      const keyNoSpec = settlementKey({
        eventId: leg.sportyEventId,
        marketId: leg.marketId,
        outcomeId: leg.outcomeId,
        specifier: '',
      });
      let settlement: SelectionSettlement = bookSel?.settlement ?? 'UNKNOWN';
      if (settlement === 'UNKNOWN' || settlement === 'PENDING') {
        settlement = scraped.get(key) ?? scraped.get(keyNoSpec) ?? settlement;
      }

      const score = fixture && 'score' in fixture ? (fixture.score ?? null) : null;
      const decision = decideLegPlayStatus({
        phase,
        settlement,
        unavailablePrematch: phase === 'prematch' && unavailable,
        score,
        matchLabel: matchLabel(leg),
        pickLabel: pickLabel(leg),
      });
      const { playStatus, playNote } = decision;

      if (playStatus === 'UPCOMING') openLegs++;
      else if (playStatus === 'LIVE') liveLegs++;
      else if (isDoneLeg(playStatus)) doneLegs++;

      await this.prisma.slipSelection.update({
        where: { id: leg.id },
        data: { playStatus, playNote, score },
      });
    }

    // Live beats open beats done. A ticket is done only when every leg is done.
    let playStatus: SlipPlayStatus = 'UNKNOWN';
    if (!selections.length) playStatus = 'UNKNOWN';
    else if (liveLegs > 0) playStatus = 'LIVE';
    else if (openLegs > 0) playStatus = 'OPEN';
    else if (doneLegs === selections.length) playStatus = 'ALL_PLAYED';
    else playStatus = 'UNKNOWN';

    const checkedAt = new Date();
    await this.prisma.generatedSlip.update({
      where: { id: slipId },
      data: {
        playStatus,
        playCheckedAt: checkedAt,
        openLegs,
        liveLegs,
        playedLegs: doneLegs,
        cutLegs: 0,
        cutSummary: null,
      },
    });

    return {
      slipId,
      bookingCode,
      playStatus,
      openLegs,
      liveLegs,
      playedLegs: doneLegs,
      cutLegs: 0,
      cutSummary: null as string | null,
      cuts: [] as Array<{
        homeTeam: string;
        awayTeam: string;
        league: string;
        marketName: string;
        selectionName: string;
        score: string | null;
        playNote: string | null;
      }>,
      totalLegs: selections.length,
      playCheckedAt: checkedAt.toISOString(),
    };
  }

  summarize(rows: Array<{ playStatus: SlipPlayStatus | string; cutLegs: number; openLegs: number; liveLegs: number; playedLegs: number }>) {
    const done = rows.filter(r => isDoneSlip(r.playStatus)).length;
    return {
      tickets: rows.length,
      open: rows.filter(r => r.playStatus === 'OPEN').length,
      live: rows.filter(r => r.playStatus === 'LIVE').length,
      done,
      /** @deprecated use done — kept for older clients */
      cut: 0,
      /** @deprecated use done */
      allPlayed: done,
      unknown: rows.filter(r => !r.playStatus || r.playStatus === 'UNKNOWN').length,
      legsOpen: rows.reduce((n, r) => n + r.openLegs, 0),
      legsLive: rows.reduce((n, r) => n + r.liveLegs, 0),
      legsDone: rows.reduce((n, r) => n + r.playedLegs + (r.cutLegs || 0), 0),
      /** @deprecated use legsDone */
      legsPlayed: rows.reduce((n, r) => n + r.playedLegs + (r.cutLegs || 0), 0),
      /** @deprecated */
      legsCut: 0,
    };
  }
}

function findBookingSelection(booking: BookmakerBooking | null, leg: LegInput) {
  return booking?.selections.find(s =>
    s.eventId === leg.sportyEventId
    && s.marketId === leg.marketId
    && s.outcomeId === leg.outcomeId
    && (s.specifier ?? '') === (leg.specifier ?? ''));
}

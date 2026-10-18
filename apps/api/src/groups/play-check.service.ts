import { Inject, Injectable } from '@nestjs/common';
import { LegPlayStatus, SlipPlayStatus } from '@prisma/client';
import type { BookmakerBooking, BookmakerFixture, LiveFixture } from '@myodd/shared';
import { BOOKMAKER_PROVIDER, type BookmakerProvider } from '../bookmaker/bookmaker.provider';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';

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

export type CutLegDetail = {
  homeTeam: string;
  awayTeam: string;
  league: string;
  marketName: string;
  selectionName: string;
  score: string | null;
  playNote: string | null;
};

function finishedStatus(matchStatus: string) {
  const value = matchStatus.toLowerCase();
  return /ended|finished|ft|aet|pen|closed|final|complete/.test(value) || value === '3' || value === '100';
}

function liveStatus(matchStatus: string) {
  const value = matchStatus.toLowerCase();
  return value === '1' || /live|inplay|in play|1st|2nd|ht|half/.test(value);
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
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

    const now = Date.now();
    let openLegs = 0, liveLegs = 0, playedLegs = 0, cutLegs = 0;
    const cuts: CutLegDetail[] = [];

    for (const leg of selections) {
      const kickoff = leg.kickoffAt?.getTime() ?? null;
      const fixture = byEvent.get(leg.sportyEventId);
      const bookSel = booking?.selections.find(s =>
        s.eventId === leg.sportyEventId
        && s.marketId === leg.marketId
        && s.outcomeId === leg.outcomeId
        && (s.specifier ?? '') === (leg.specifier ?? ''));
      const unavailable = booking?.unavailableOutcomes?.some(s =>
        s.eventId === leg.sportyEventId
        && s.marketId === leg.marketId
        && s.outcomeId === leg.outcomeId) ?? false;
      const active = !!bookSel && bookSel.isActive !== false && !unavailable;
      const score = fixture && 'score' in fixture ? (fixture.score ?? null) : null;
      const match = matchLabel(leg);
      const pick = pickLabel(leg);

      let playStatus: LegPlayStatus = 'UNKNOWN';
      let playNote: string | null = null;

      if (kickoff != null && kickoff > now + 2 * 60_000) {
        playStatus = unavailable ? 'CUT' : 'UPCOMING';
        playNote = playStatus === 'CUT'
          ? `Cut · ${match} · ${pick} unavailable before kickoff`
          : 'Not kicked off yet';
      } else if (fixture && finishedStatus(fixture.matchStatus)) {
        playStatus = unavailable || (booking && !active) ? 'CUT' : 'PLAYED';
        playNote = playStatus === 'CUT'
          ? `Cut · ${match}${score ? ` (${score})` : ''} · ${pick} lost / unavailable`
          : `Finished${score ? ` · ${score}` : ''}`;
      } else if ((fixture && liveStatus(fixture.matchStatus)) || (kickoff != null && kickoff <= now && kickoff > now - 3 * 3600_000)) {
        playStatus = unavailable || (booking && !active) ? 'CUT' : 'LIVE';
        playNote = playStatus === 'CUT'
          ? `Cut while live · ${match}${score ? ` (${score})` : ''} · ${pick}`
          : `In play${score ? ` · ${score}` : ''}`;
      } else if (kickoff != null && kickoff <= now - 3 * 3600_000) {
        playStatus = unavailable || (booking && !active) ? 'CUT' : 'PLAYED';
        playNote = playStatus === 'CUT'
          ? `Cut · ${match}${score ? ` (${score})` : ''} · ${pick} unavailable after kickoff`
          : `Likely finished${score ? ` · ${score}` : ''}`;
      } else if (unavailable || (booking && !active)) {
        playStatus = 'CUT';
        playNote = `Cut · ${match} · ${pick} unavailable`;
      } else {
        playStatus = 'UNKNOWN';
        playNote = 'Could not confirm play state';
      }

      if (playStatus === 'UPCOMING') openLegs++;
      else if (playStatus === 'LIVE') liveLegs++;
      else if (playStatus === 'PLAYED') playedLegs++;
      else if (playStatus === 'CUT') {
        cutLegs++;
        cuts.push({
          homeTeam: leg.homeTeam ?? 'Home',
          awayTeam: leg.awayTeam ?? 'Away',
          league: leg.league ?? '',
          marketName: leg.marketName ?? 'Market',
          selectionName: leg.selectionName ?? 'Selection',
          score,
          playNote,
        });
      }

      await this.prisma.slipSelection.update({
        where: { id: leg.id },
        data: { playStatus, playNote, score },
      });
    }

    // One cut leg kills the whole ticket.
    let playStatus: SlipPlayStatus = 'UNKNOWN';
    if (!selections.length) playStatus = 'UNKNOWN';
    else if (cutLegs > 0) playStatus = 'CUT';
    else if (liveLegs > 0) playStatus = 'LIVE';
    else if (openLegs > 0) playStatus = 'OPEN';
    else if (playedLegs > 0) playStatus = 'ALL_PLAYED';
    else playStatus = 'UNKNOWN';

    const cutSummary = cuts.length
      ? cuts.map(c => `${c.homeTeam} vs ${c.awayTeam}${c.score ? ` (${c.score})` : ''} · ${c.marketName}: ${c.selectionName}`).join(' · ')
      : null;

    const checkedAt = new Date();
    await this.prisma.generatedSlip.update({
      where: { id: slipId },
      data: {
        playStatus,
        playCheckedAt: checkedAt,
        openLegs,
        liveLegs,
        playedLegs,
        cutLegs,
        cutSummary,
      },
    });

    return {
      slipId,
      bookingCode,
      playStatus,
      openLegs,
      liveLegs,
      playedLegs,
      cutLegs,
      cutSummary,
      cuts,
      totalLegs: selections.length,
      playCheckedAt: checkedAt.toISOString(),
    };
  }

  summarize(rows: Array<{ playStatus: SlipPlayStatus; cutLegs: number; openLegs: number; liveLegs: number; playedLegs: number }>) {
    return {
      tickets: rows.length,
      open: rows.filter(r => r.playStatus === 'OPEN').length,
      live: rows.filter(r => r.playStatus === 'LIVE').length,
      cut: rows.filter(r => r.playStatus === 'CUT').length,
      allPlayed: rows.filter(r => r.playStatus === 'ALL_PLAYED').length,
      unknown: rows.filter(r => r.playStatus === 'UNKNOWN').length,
      legsOpen: rows.reduce((n, r) => n + r.openLegs, 0),
      legsLive: rows.reduce((n, r) => n + r.liveLegs, 0),
      legsPlayed: rows.reduce((n, r) => n + r.playedLegs, 0),
      legsCut: rows.reduce((n, r) => n + r.cutLegs, 0),
    };
  }
}

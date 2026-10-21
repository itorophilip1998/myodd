import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, SlipPlayStatus } from '@prisma/client';
import {
  settlementKey,
  aggregateSettlement,
  explicitSettlement,
  hasSettlementConflict,
  type BookmakerBooking,
  type BookmakerFixture,
  type LiveFixture,
  type SelectionSettlement,
} from '@myodd/shared';
import { BOOKMAKER_PROVIDER, type BookmakerProvider } from '../bookmaker/bookmaker.provider';
import { SportyBetSettlementService } from '../bookmaker/sportybet.settlement';
import { PrismaService } from '../prisma/prisma.service';
import { decideLegPlayStatus, isDoneLeg, isDoneSlip, matchPhase, type LegMatchPhase } from './play-leg-status';
import { FootballResultsService, type MatchEvidence } from './football-results.service';

type LegInput = {
  id: string;
  sportyEventId: string;
  marketId: string;
  outcomeId: string;
  specifier: string;
  kickoffAt: Date | null;
  result?: SelectionSettlement;
  resultSource?: string | null;
  resultCheckedAt?: Date | null;
  resultEvidence?: unknown;
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
    private readonly settlement: SportyBetSettlementService,
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
    @Optional() private readonly footballResults?: FootballResultsService,
  ) {}

  async checkSlips(slipIds: string[]) {
    const slips = await this.prisma.generatedSlip.findMany({
      where: { id: { in: slipIds } },
      include: { selections: true },
    });
    const eventIds = [...new Set(slips.flatMap(s => s.selections.map(leg => leg.sportyEventId)).filter(Boolean))];
    const [live, fixtures] = await Promise.all([
      this.bookmaker.getLiveFixtures().catch(() => [] as LiveFixture[]),
      eventIds.length ? this.bookmaker.getFixtures({ eventIds, fresh: true }).catch(() => [] as BookmakerFixture[]) : Promise.resolve([]),
    ]);
    const results = [];
    for (const slip of slips) {
      results.push(await this.checkOne(slip.id, slip.bookingCode, slip.selections, live, fixtures));
    }
    return results;
  }

  async checkOne(slipId: string, bookingCode: string, selections: LegInput[], liveFixtures?: LiveFixture[], checkedFixtures?: BookmakerFixture[]) {
    // Settlement must work after catalog expiry and must never use its stale snapshot.
    const booking = await this.bookmaker.getBooking(bookingCode, { fresh: true }).catch(() => null);
    const validBooking = booking?.code.toUpperCase() === bookingCode.toUpperCase() ? booking : null;
    const eventIds = [...new Set(selections.map(s => s.sportyEventId).filter(Boolean))];
    const [fixtures, live] = await Promise.all([
      checkedFixtures ?? (eventIds.length ? this.bookmaker.getFixtures({ eventIds, fresh: true }).catch(() => [] as BookmakerFixture[]) : Promise.resolve([] as BookmakerFixture[])),
      liveFixtures ? Promise.resolve(liveFixtures) : this.bookmaker.getLiveFixtures().catch(() => [] as LiveFixture[]),
    ]);
    const byEvent = new Map<string, BookmakerFixture | LiveFixture>();
    for (const f of fixtures) byEvent.set(f.eventId, f);
    for (const f of live) byEvent.set(f.eventId, f);

    const needsScrape = selections.some(leg => {
      const bookSel = findBookingSelection(validBooking, leg);
      const settlement = bookSel?.settlement ?? 'UNKNOWN';
      return settlement === 'UNKNOWN' || settlement === 'PENDING';
    });

    let scraped = new Map<string, SelectionSettlement>();
    if (needsScrape) {
      scraped = await this.settlement.fetchShareSettlement(bookingCode, { fresh: true }).catch(err => {
        this.logger.warn(`Settlement scrape skipped for ${bookingCode}: ${(err as Error).message}`);
        return new Map<string, SelectionSettlement>();
      });
    }

    const now = Date.now();
    let openLegs = 0, liveLegs = 0, doneLegs = 0;
    const results: SelectionSettlement[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    const checkedAt = new Date();
    const matchEvidence: Array<{ selectionId: string; evidence: MatchEvidence }> = [];
    const cuts: Array<{ homeTeam: string; awayTeam: string; league: string; marketName: string;
      selectionName: string; score: string | null; playNote: string | null }> = [];

    for (const leg of selections) {
      const kickoff = leg.kickoffAt?.getTime() ?? null;
      const fixture = byEvent.get(leg.sportyEventId);
      const bookSel = findBookingSelection(validBooking, leg);
      const unavailable = validBooking?.unavailableOutcomes?.some(s =>
        s.eventId === leg.sportyEventId
        && s.marketId === leg.marketId
        && s.outcomeId === leg.outcomeId
        && (s.specifier ?? '') === (leg.specifier ?? '')) ?? false;
      const fixturePhase = matchPhase({
        kickoffMs: kickoff,
        nowMs: now,
        matchStatus: fixture && 'liveStatus' in fixture ? 'live' : fixture?.matchStatus,
      });
      // Share responses can still describe a finished match after the event feed expires.
      const bookingPhase = matchPhase({ kickoffMs: null, nowMs: now, matchStatus: bookSel?.matchStatus });
      let phase: LegMatchPhase = fixturePhase === 'finished' || bookingPhase === 'finished' ? 'finished'
        : fixturePhase === 'live' || bookingPhase === 'live' ? 'live' : fixturePhase;
      const independent = phase === 'unknown' ? await this.footballResults?.lookup(leg) : null;
      if (independent) {
        phase = independent.phase;
        matchEvidence.push({ selectionId: leg.id, evidence: independent });
      }
      const key = settlementKey({
        eventId: leg.sportyEventId,
        marketId: leg.marketId,
        outcomeId: leg.outcomeId,
        specifier: leg.specifier ?? '',
      });
      let settlement: SelectionSettlement = bookSel?.settlement ?? 'UNKNOWN';
      let source: string | null = bookSel && settlement !== 'UNKNOWN' ? 'SPORTYBET_SHARE_JSON' : null;
      if (settlement === 'UNKNOWN' || settlement === 'PENDING') {
        // Never drop the specifier: over 1.5 and over 2.5 are different bets.
        const pageResult = scraped.get(key);
        if (pageResult !== undefined) {
          settlement = pageResult;
          source = 'SPORTYBET_SHARE_PAGE';
        }
      }
      const pageResult = scraped.get(key);
      const sourceConflict = hasSettlementConflict(bookSel?.settlement, pageResult);
      if (bookSel?.settlementConflict || sourceConflict || pageResult === 'UNKNOWN') settlement = 'UNKNOWN';
      const hasFreshResult = settlement === 'WON' || settlement === 'LOST' || settlement === 'VOID';
      const priorConfirmed = leg.resultEvidence != null && ['WON', 'LOST', 'VOID'].includes(leg.result ?? '');
      // Preserve confirmed evidence through outages. An explicit conflicting page row
      // is retained as UNKNOWN rather than restoring a previous result.
      const conflict = !!bookSel?.settlementConflict || sourceConflict || pageResult === 'UNKNOWN';
      const retained = !hasFreshResult && !conflict && priorConfirmed;
      if (retained) {
        settlement = leg.result!;
        source = leg.resultSource ?? null;
      } else if (settlement === 'UNKNOWN' && !conflict && (phase === 'prematch' || phase === 'live')) {
        settlement = 'PENDING';
      }
      results.push(settlement);
      const evidence = { selectionKey: key, result: settlement, source, matchEvidence: independent ?? null,
        observedAt: checkedAt.toISOString(), conflict };

      const score = independent?.score ?? fixture?.score ?? null;
      const decision = decideLegPlayStatus({
        phase,
        settlement,
        unavailablePrematch: phase === 'prematch' && unavailable,
        score,
        matchLabel: matchLabel(leg),
        pickLabel: pickLabel(leg),
      });
      const playStatus = decision.playStatus;
      const playNote = `${decision.playNote}${independent ? ' · Match status: API-Football' : ''}`;
      if (settlement === 'LOST') cuts.push({
        homeTeam: leg.homeTeam ?? '', awayTeam: leg.awayTeam ?? '', league: leg.league ?? '',
        marketName: leg.marketName ?? '', selectionName: leg.selectionName ?? '', score, playNote,
      });

      if (playStatus === 'UPCOMING') openLegs++;
      else if (playStatus === 'LIVE') liveLegs++;
      else if (isDoneLeg(playStatus)) doneLegs++;

      updates.push(this.prisma.slipSelection.update({
        where: { id: leg.id },
        data: { playStatus, playNote, score, result: settlement,
          ...(!retained ? { resultSource: source, resultCheckedAt: checkedAt, resultEvidence: evidence } : {}),
        },
      }));
    }

    // Live beats open beats done. A ticket is done only when every leg is done.
    let playStatus: SlipPlayStatus = 'UNKNOWN';
    if (!selections.length) playStatus = 'UNKNOWN';
    else if (liveLegs > 0) playStatus = 'LIVE';
    else if (openLegs > 0) playStatus = 'OPEN';
    else if (doneLegs === selections.length) playStatus = 'ALL_PLAYED';
    else playStatus = 'UNKNOWN';

    const result = aggregateSettlement(results);
    const cutLegs = results.filter(r => r === 'LOST').length;
    updates.push(this.prisma.generatedSlip.update({
      where: { id: slipId },
      data: {
        playStatus,
        playCheckedAt: checkedAt,
        openLegs,
        liveLegs,
        playedLegs: doneLegs,
        result,
        cutLegs,
        cutSummary: cutLegs ? `${cutLegs} confirmed losing selection(s)` : null,
      },
    }));
    updates.push(this.prisma.trainingEvent.create({ data: {
      kind: 'SETTLEMENT_CHECKED', payload: JSON.parse(JSON.stringify({
        slipId, bookingCode, checkedAt, result, results,
        booking: validBooking, pageResults: Object.fromEntries(scraped), matchEvidence,
      })),
    } }));
    // Readers never see partially updated ticket/selection results.
    await this.prisma.$transaction(updates);

    return {
      slipId,
      result,
      bookingCode,
      playStatus,
      openLegs,
      liveLegs,
      playedLegs: doneLegs,
      cutLegs,
      cutSummary: cutLegs ? `${cutLegs} confirmed losing selection(s)` : null,
      cuts,
      totalLegs: selections.length,
      playCheckedAt: checkedAt.toISOString(),
    };
  }

  summarize(rows: Array<{ result?: SelectionSettlement; playStatus: SlipPlayStatus | string; cutLegs: number; openLegs: number; liveLegs: number; playedLegs: number }>) {
    const done = rows.filter(r => isDoneSlip(r.playStatus)).length;
    return {
      tickets: rows.length,
      won: rows.filter(r => r.result === 'WON').length,
      lost: rows.filter(r => r.result === 'LOST').length,
      void: rows.filter(r => r.result === 'VOID').length,
      pending: rows.filter(r => r.result === 'PENDING').length,
      awaitingConfirmation: rows.filter(r => !r.result || r.result === 'UNKNOWN').length,
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
      legsDone: rows.reduce((n, r) => n + r.playedLegs + (r.playStatus === 'CUT' ? (r.cutLegs || 0) : 0), 0),
      /** @deprecated use legsDone */
      legsPlayed: rows.reduce((n, r) => n + r.playedLegs + (r.playStatus === 'CUT' ? (r.cutLegs || 0) : 0), 0),
      /** @deprecated */
      legsCut: 0,
    };
  }
}

function findBookingSelection(booking: BookmakerBooking | null, leg: LegInput) {
  const matches = [...(booking?.selections ?? []), ...(booking?.unavailableOutcomes ?? [])].filter(s =>
    s.eventId === leg.sportyEventId
    && s.marketId === leg.marketId
    && s.outcomeId === leg.outcomeId
    && (s.specifier ?? '') === (leg.specifier ?? ''));
  if (!matches.length) return undefined;
  const values = matches.map(s => s.settlement);
  return { ...matches[0], settlement: explicitSettlement(...values),
    settlementConflict: matches.some(s => s.settlementConflict) || hasSettlementConflict(...values) };
}

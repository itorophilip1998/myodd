import {
  MIN_SELECTION_ODDS,
  explicitSettlement,
  hasSettlementConflict,
  type LiveFixture,
  type BookmakerBooking,
  type BookmakerFixture,
  type BookmakerMarket,
  type BookmakerOutcome,
  type BookmakerSelection,
  type SelectionSettlement,
} from '@myodd/shared';

interface RawOutcome {
  id: string;
  desc: string;
  odds: string | number;
  isActive?: boolean | number | string;
  status?: string | number;
  result?: string | number;
  settleStatus?: string | number;
  outcomeStatus?: string | number;
}

interface RawMarket {
  id: string;
  desc: string;
  specifier?: string;
  status?: string | number;
  outcomes?: RawOutcome[];
}

interface RawEvent {
  eventId: string;
  homeTeamName: string;
  awayTeamName: string;
  estimateStartTime: number;
  matchStatus?: string | number;
  status?: number | string;
  setScore?: string;
  playedSeconds?: string;
  markets?: RawMarket[];
  sport?: { category?: { name?: string; tournament?: { name?: string } } };
}

interface RawTournament {
  id: string;
  name: string;
  categoryName?: string;
  events?: RawEvent[];
}

interface UpcomingEventsData {
  totalNum?: number;
  tournaments?: RawTournament[];
}

interface ShareOutcome {
  eventId?: string;
  marketId?: string;
  outcomeId?: string;
  specifier?: string;
  odds?: string | number;
  marketDesc?: string;
  outcomeDesc?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  tournamentName?: string;
  estimateStartTime?: number;
  status?: string | number;
  result?: string | number;
  settleStatus?: string | number;
  outcomeStatus?: string | number;
  selectionStatus?: string | number;
  markets?: RawMarket[];
  sport?: { category?: { tournament?: { name?: string } } };
}

interface ShareData {
  shareCode?: string;
  shareURL?: string;
  deadline?: number;
  outcomes?: ShareOutcome[];
  unavailableOutcomes?: ShareOutcome[];
  ticket?: {
    selections?: ShareOutcome[];
    displayTotalOdds?: string | number;
    status?: string | number;
    ticketStatus?: string | number;
  };
}

export function mapFixtures(data: UpcomingEventsData): BookmakerFixture[] {
  const fixtures: BookmakerFixture[] = [];
  for (const t of data.tournaments ?? []) {
    for (const e of t.events ?? []) {
      fixtures.push(mapEvent(e, t.name, t.categoryName));
    }
  }
  return fixtures;
}

export function mapLiveFixtures(tournaments: RawTournament[]): LiveFixture[] {
  const games: LiveFixture[] = [];
  for (const tournament of tournaments) for (const event of tournament.events ?? []) {
    // The live-list response can include a pre-match event; never relabel it as live.
    if (String(event.status) !== '1') continue;
    const fixture = mapEvent(event, tournament.name, tournament.categoryName);
    games.push({ ...fixture, score: /^\d+:\d+$/.test(event.setScore ?? '') ? event.setScore!.replace(':', ' : ') : null,
      clock: /^\d{1,3}:\d{2}$/.test(event.playedSeconds ?? '') ? event.playedSeconds! : null,
      liveStatus: String(event.matchStatus ?? 'Live') });
  }
  return games;
}

export function mapEvent(event: RawEvent, league?: string, category?: string): BookmakerFixture {
  return {
    eventId: event.eventId, homeTeam: event.homeTeamName, awayTeam: event.awayTeamName,
    league: league ?? event.sport?.category?.tournament?.name ?? '',
    categoryName: category ?? event.sport?.category?.name ?? '',
    kickoffAt: new Date(event.estimateStartTime).toISOString(),
    matchStatus: String(event.matchStatus ?? ''),
    markets: (event.markets ?? []).map(mapMarket),
  };
}

export function mapMarket(m: RawMarket): BookmakerMarket {
  return {
    marketId: String(m.id),
    marketName: m.desc,
    specifier: m.specifier ?? '',
    status: String(m.status ?? ''),
    outcomes: (m.outcomes ?? []).map(mapOutcome).filter(o => Number.isFinite(o.odds) && o.odds >= MIN_SELECTION_ODDS),
  };
}

export function mapOutcome(o: RawOutcome): BookmakerOutcome {
  return {
    outcomeId: String(o.id),
    outcomeName: o.desc,
    odds: Number(o.odds),
    isActive: o.isActive === true || o.isActive === 1 || o.isActive === '1',
  };
}

export function mapShareResponse(
  data: ShareData,
  region: string,
): BookmakerBooking {
  const code = data.shareCode;
  if (!code) {
    throw Object.assign(new Error('NO_BOOKING_CODE'), { code: 'NO_BOOKING_CODE' });
  }
  const selections = mapBookingOutcomes(data.outcomes ?? [], data.ticket?.selections);
  const unavailable = mapBookingOutcomes(data.unavailableOutcomes ?? [], data.ticket?.selections)
    .map(selection => ({ ...selection, isActive: false }));
  const ticketOdds = Number(data.ticket?.displayTotalOdds);
  const totalOdds = Number.isFinite(ticketOdds) && ticketOdds > 1 ? ticketOdds
    : selections.length && selections.every(s => Number.isFinite(s.odds) && s.odds! >= MIN_SELECTION_ODDS)
      ? selections.reduce((acc, s) => acc * s.odds!, 1) : null;
  return {
    code,
    shareUrl:
      data.shareURL ??
      `https://www.sportybet.com/${region}/?shareCode=${code}`,
    deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
    totalOdds: totalOdds === null ? null : Math.round(totalOdds * 100) / 100,
    selections,
    unavailableOutcomes: unavailable,
  };
}

function readSettlement(...values: unknown[]) {
  return { settlement: explicitSettlement(...values), settlementConflict: hasSettlementConflict(...values) };
}

function mapBookingOutcomes(events: ShareOutcome[], requested?: ShareOutcome[]): BookmakerSelection[] {
  return events.flatMap(event => {
    if (!event.markets?.length) return [mapShareOutcome(event)];
    // Share responses contain events with nested markets. Ticket IDs identify the booked outcomes.
    const selected = requested?.filter(s => s.eventId === event.eventId)
      ?? event.markets.flatMap(m => (m.outcomes ?? []).map(o => ({
        eventId: event.eventId, marketId: m.id, specifier: m.specifier ?? '', outcomeId: o.id,
      })));
    return selected.map(selection => {
      const market = event.markets!.find(m => String(m.id) === String(selection.marketId)
        && (m.specifier ?? '') === (selection.specifier ?? ''));
      const outcome = market?.outcomes?.find(o => String(o.id) === String(selection.outcomeId));
      const base = mapShareOutcome({ ...event, ...selection, odds: outcome?.odds,
        marketDesc: market?.desc, outcomeDesc: outcome?.desc,
        tournamentName: event.sport?.category?.tournament?.name ?? event.tournamentName });
      return {
        ...base,
        // Bettability only — finished events are inactive for betting, not necessarily lost.
        isActive: !!outcome && mapOutcome(outcome).isActive
          && String(market?.status ?? '0') === '0' && String(event.status ?? '0') === '0',
        ...readSettlement(
          (selection as ShareOutcome).settleStatus,
          (selection as ShareOutcome).outcomeStatus,
          (selection as ShareOutcome).selectionStatus,
          (selection as ShareOutcome).result,
          outcome?.settleStatus,
          outcome?.outcomeStatus,
          outcome?.result,
        ),
      };
    });
  });
}

function mapShareOutcome(o: ShareOutcome): BookmakerSelection {
  return {
    eventId: String(o.eventId ?? ''),
    marketId: String(o.marketId ?? ''),
    outcomeId: String(o.outcomeId ?? ''),
    specifier: o.specifier ?? '',
    odds: o.odds !== undefined ? Number(o.odds) : undefined,
    marketName: o.marketDesc,
    selectionName: o.outcomeDesc,
    homeTeam: o.homeTeamName,
    awayTeam: o.awayTeamName,
    league: o.tournamentName,
    kickoffAt: o.estimateStartTime
      ? new Date(o.estimateStartTime).toISOString()
      : undefined,
    isActive: o.status !== 'suspended',
    ...readSettlement(o.settleStatus, o.outcomeStatus, o.selectionStatus, o.result),
  };
}

export function toSharePayload(selections: BookmakerSelection[]) {
  return {
    selections: selections.map((s) => ({
      eventId: s.eventId,
      marketId: s.marketId,
      specifier: s.specifier ?? '',
      outcomeId: s.outcomeId,
    })),
  };
}

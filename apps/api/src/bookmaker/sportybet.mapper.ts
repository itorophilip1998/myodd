import type {
  BookmakerBooking,
  BookmakerFixture,
  BookmakerMarket,
  BookmakerOutcome,
  BookmakerSelection,
} from '@myodd/shared';

interface RawOutcome {
  id: string;
  desc: string;
  odds: string | number;
  isActive?: boolean | number | string;
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
  markets?: RawMarket[];
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
  status?: string;
}

interface ShareData {
  shareCode?: string;
  shareURL?: string;
  deadline?: number;
  outcomes?: ShareOutcome[];
  unavailableOutcomes?: ShareOutcome[];
}

export function mapFixtures(data: UpcomingEventsData): BookmakerFixture[] {
  const fixtures: BookmakerFixture[] = [];
  for (const t of data.tournaments ?? []) {
    for (const e of t.events ?? []) {
      fixtures.push({
        eventId: e.eventId,
        homeTeam: e.homeTeamName,
        awayTeam: e.awayTeamName,
        league: t.name,
        categoryName: t.categoryName ?? '',
        kickoffAt: new Date(e.estimateStartTime).toISOString(),
        matchStatus: String(e.matchStatus ?? ''),
        markets: (e.markets ?? []).map(mapMarket),
      });
    }
  }
  return fixtures;
}

export function mapMarket(m: RawMarket): BookmakerMarket {
  return {
    marketId: String(m.id),
    marketName: m.desc,
    specifier: m.specifier ?? '',
    status: String(m.status ?? ''),
    outcomes: (m.outcomes ?? []).map(mapOutcome),
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
  const selections = (data.outcomes ?? []).map(mapShareOutcome);
  const unavailable = (data.unavailableOutcomes ?? []).map(mapShareOutcome);
  const totalOdds = selections.reduce((acc, s) => acc * (s.odds ?? 1), 1);
  return {
    code,
    shareUrl:
      data.shareURL ??
      `https://www.sportybet.com/${region}/?shareCode=${code}`,
    deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
    totalOdds: Math.round(totalOdds * 100) / 100,
    selections,
    unavailableOutcomes: unavailable,
  };
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

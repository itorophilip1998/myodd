import type { SupportedMarket, VarianceLevel, JobStatus } from './enums';

export interface BookmakerSelection {
  eventId: string;
  marketId: string;
  outcomeId: string;
  specifier: string;
  odds?: number;
  marketName?: string;
  selectionName?: string;
  homeTeam?: string;
  awayTeam?: string;
  league?: string;
  kickoffAt?: string;
  isActive?: boolean;
}

export interface BookmakerBooking {
  code: string;
  shareUrl: string;
  deadline: string | null;
  totalOdds: number | null;
  selections: BookmakerSelection[];
  unavailableOutcomes: BookmakerSelection[];
}

export interface BookmakerFixture {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  categoryName: string;
  kickoffAt: string;
  matchStatus: string;
  markets: BookmakerMarket[];
}

export interface LiveFixture extends BookmakerFixture {
  score: string | null;
  clock: string | null;
  liveStatus: string;
}

export interface BookmakerMarket {
  marketId: string;
  marketName: string;
  specifier: string;
  status: string;
  outcomes: BookmakerOutcome[];
}

export interface BookmakerOutcome {
  outcomeId: string;
  outcomeName: string;
  odds: number;
  isActive: boolean;
}

export interface ScoredSelection extends BookmakerSelection {
  supportedMarket: SupportedMarket;
  probability: number;
  confidence: number;
  modelVersion: string;
}

export interface GeneratedSlipDto {
  id: string;
  bookingCode: string;
  shareUrl: string;
  totalOdds: number;
  confidence: number;
  riskLevel: VarianceLevel;
  selectionCount: number;
  rankOrder?: number;
  slipScore?: number;
  selections: SlipSelectionDto[];
  expiresAt: string | null;
}

export interface SlipSelectionDto {
  homeTeam: string;
  awayTeam: string;
  league: string;
  marketName: string;
  selectionName: string;
  odds: number;
  predictionProbability: number;
  predictionScore: number;
  modelVersion: string;
  kickoffAt: string | null;
}

export interface SlipGroupDto {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  createdAt: string;
  expiresAt: string | null;
  originalBookingCode: string | null;
  slips: GeneratedSlipDto[];
  counts: {
    lower: number;
    moderate: number;
    higher: number;
  };
}

export interface JobProgressDto {
  id: string;
  status: JobStatus;
  progress: number;
  total: number;
  groupId: string | null;
  publicId: string | null;
  error: string | null;
  failedCount: number;
}

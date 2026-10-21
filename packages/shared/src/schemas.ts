import { z } from 'zod';
import { RiskPreference, SupportedMarket } from './enums';

export const generationConfigSchema = z.object({
  numberOfSlips: z.number().int().min(1).max(50).default(10),
  minimumOdds: z.number().finite().min(1.1).default(2.5),
  maximumOdds: z.number().finite().min(1.1).nullable().default(5),
  maximumSelections: z.number().int().min(1).max(50).default(50),
  minimumSelections: z.number().int().min(1).max(50).default(1),
  markets: z.array(z.nativeEnum(SupportedMarket)).default([]),
  marketQueries: z.array(z.string()).default([]),
  marketRules: z.array(z.object({
    marketId: z.string(), specifier: z.string().nullable().default(null),
    outcomeIds: z.array(z.string()).default([]),
  })).default([]),
  relatedMarketRules: z.array(z.object({
    marketId: z.string(), specifier: z.string().nullable().default(null),
    outcomeIds: z.array(z.string()).default([]),
  })).default([]),
  marketPolicy: z.enum(['prefer', 'only']).default('prefer'),
  fixtureMode: z.enum(['adaptive', 'original_only', 'upcoming']).default('adaptive'),
  preserveOriginalSelections: z.boolean().default(false),
  allowOddsAdjustment: z.boolean().default(false),
  minimumProbability: z.number().min(0).max(1).nullable().default(null),
  riskMode: z.enum(['INVESTOR', 'GAMBLER', 'JAPA', 'LAGOS_LIFE']).nullable().default(null),
  riskPreference: z.nativeEnum(RiskPreference).default(RiskPreference.LOWER),
  excludedTeams: z.array(z.string()).default([]),
  includedTeams: z.array(z.string()).default([]),
  includedLeagues: z.array(z.string()).default([]),
  excludedLeagues: z.array(z.string()).default([]),
  kickoffAfter: z.string().datetime({ offset: true }).nullable().default(null),
  kickoffBefore: z.string().datetime({ offset: true }).nullable().default(null),
  unhandledRequests: z.array(z.string()).default([]),
}).refine(config => config.minimumSelections <= config.maximumSelections, {
  message: 'Minimum selections cannot exceed maximum selections',
});

export type GenerationConfig = z.infer<typeof generationConfigSchema>;

export const analyzeSlipSchema = z.object({
  bookingCode: z.string().min(3).max(32).trim(),
});

const matchDateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const ticketOddsFields = {
  /** Hard ticket-odds floor from the UI range control. */
  minimumOdds: z.number().finite().min(1.1).optional(),
  /** Hard ticket-odds ceiling from the UI range control. Null = no ceiling (Lagoslife). */
  maximumOdds: z.number().finite().min(1.1).nullable().optional(),
};

/** Exact SportyBet outcomes pinned from the predictions book. */
export const pinnedSelectionSchema = z.object({
  eventId: z.string().min(1).max(64),
  marketId: z.string().min(1).max(64),
  outcomeId: z.string().min(1).max(64),
  specifier: z.string().max(128).default(''),
  odds: z.number().finite().min(1.01).optional(),
  marketName: z.string().max(200).optional(),
  selectionName: z.string().max(200).optional(),
  homeTeam: z.string().max(200).optional(),
  awayTeam: z.string().max(200).optional(),
  league: z.string().max(200).optional(),
  kickoffAt: z.string().optional(),
});

export const generateFromCodeSchema = z.object({
  operation: z.enum(['generate', 'split']).optional(),
  profileId: z.string().uuid().optional(),
  ticketCount: z.number().int().min(1).max(50).optional(),
  gamesPerTicket: z.number().int().min(1).max(50).optional(),
  splitInto: z.number().int().min(1).max(50).optional(),
  bookingCode: z.string().min(3).max(32).trim().optional(),
  /** Africa/Lagos calendar day `YYYY-MM-DD`. Defaults to today (next 24 hours). */
  matchDate: matchDateField,
  ...ticketOddsFields,
  instruction: z.string().min(3).max(6000).trim(),
  pinnedSelections: z.array(pinnedSelectionSchema).min(1).max(50).optional(),
});

export const generateFromPromptSchema = z.object({
  operation: z.enum(['generate', 'split']).optional(),
  profileId: z.string().uuid().optional(),
  ticketCount: z.number().int().min(1).max(50).optional(),
  gamesPerTicket: z.number().int().min(1).max(50).optional(),
  splitInto: z.number().int().min(1).max(50).optional(),
  /** Africa/Lagos calendar day `YYYY-MM-DD`. Defaults to today (next 24 hours). */
  matchDate: matchDateField,
  ...ticketOddsFields,
  instruction: z.string().min(3).max(6000).trim(),
  pinnedSelections: z.array(pinnedSelectionSchema).min(1).max(50).optional(),
});

export type AnalyzeSlipInput = z.infer<typeof analyzeSlipSchema>;
export type GenerateFromCodeInput = z.infer<typeof generateFromCodeSchema>;
export type GenerateFromPromptInput = z.infer<typeof generateFromPromptSchema>;

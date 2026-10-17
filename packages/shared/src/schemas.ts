import { z } from 'zod';
import { RiskPreference, SupportedMarket } from './enums';

export const generationConfigSchema = z.object({
  numberOfSlips: z.number().int().min(1).max(100).default(10),
  minimumOdds: z.number().finite().min(1).default(2.5),
  maximumOdds: z.number().finite().min(1).nullable().default(5),
  maximumSelections: z.number().int().min(1).max(30).default(20),
  minimumSelections: z.number().int().min(1).max(30).default(2),
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

export const generateFromCodeSchema = z.object({
  operation: z.enum(['generate', 'split']).optional(),
  profileId: z.string().uuid().optional(),
  ticketCount: z.number().int().min(1).max(100).optional(),
  gamesPerTicket: z.number().int().min(1).max(30).optional(),
  splitInto: z.number().int().min(1).max(100).optional(),
  bookingCode: z.string().min(3).max(32).trim().optional(),
  instruction: z.string().min(3).max(6000).trim(),
});

export const generateFromPromptSchema = z.object({
  operation: z.enum(['generate', 'split']).optional(),
  profileId: z.string().uuid().optional(),
  ticketCount: z.number().int().min(1).max(100).optional(),
  gamesPerTicket: z.number().int().min(1).max(30).optional(),
  splitInto: z.number().int().min(1).max(100).optional(),
  instruction: z.string().min(3).max(6000).trim(),
});

export type AnalyzeSlipInput = z.infer<typeof analyzeSlipSchema>;
export type GenerateFromCodeInput = z.infer<typeof generateFromCodeSchema>;
export type GenerateFromPromptInput = z.infer<typeof generateFromPromptSchema>;

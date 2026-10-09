import { z } from 'zod';
import { RiskPreference, SupportedMarket } from './enums';

export const generationConfigSchema = z.object({
  numberOfSlips: z.number().int().min(1).max(50).default(10),
  minimumOdds: z.number().min(1.01).max(1000).default(2.5),
  maximumOdds: z.number().min(1.01).max(1000).default(5),
  maximumSelections: z.number().int().min(2).max(12).default(8),
  minimumSelections: z.number().int().min(1).max(12).default(2),
  markets: z
    .array(z.nativeEnum(SupportedMarket))
    .default([
      SupportedMarket.DOUBLE_CHANCE_1X,
      SupportedMarket.DOUBLE_CHANCE_X2,
      SupportedMarket.OVER_1_5,
      SupportedMarket.HOME,
    ]),
  riskPreference: z.nativeEnum(RiskPreference).default(RiskPreference.LOWER),
  excludedTeams: z.array(z.string()).default([]),
  kickoffBefore: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .transform((v) => v ?? null)
    .default(null),
});

export type GenerationConfig = z.infer<typeof generationConfigSchema>;

export const analyzeSlipSchema = z.object({
  bookingCode: z.string().min(3).max(32).trim(),
});

export const generateFromCodeSchema = z.object({
  bookingCode: z.string().min(3).max(32).trim().optional(),
  instruction: z.string().min(3).max(2000).trim(),
});

export const generateFromPromptSchema = z.object({
  instruction: z.string().min(3).max(2000).trim(),
});

export type AnalyzeSlipInput = z.infer<typeof analyzeSlipSchema>;
export type GenerateFromCodeInput = z.infer<typeof generateFromCodeSchema>;
export type GenerateFromPromptInput = z.infer<typeof generateFromPromptSchema>;

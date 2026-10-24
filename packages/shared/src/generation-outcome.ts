import { z } from 'zod';

export const generationFailureSchema = z.object({
  code: z.enum(['INVALID_CODE', 'UNAVAILABLE_CODE', 'UNAVAILABLE_MARKET', 'PROVIDER_ERROR', 'NETWORK_ERROR', 'BOOKING_UNCERTAIN', 'SHORTAGE', 'UNEXPECTED_ERROR']),
  message: z.string(), taskId: z.string().optional(), retryable: z.boolean(),
});
export type GenerationFailure = z.infer<typeof generationFailureSchema>;
export const generationOutcomeSchema = z.object({
  requestId: z.string(), status: z.enum(['loading', 'success', 'partial_success', 'empty', 'failed']),
  requested: z.number().int().nonnegative(), generated: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
  errors: z.array(generationFailureSchema),
});
export type GenerationOutcome = z.infer<typeof generationOutcomeSchema>;
export const generateResponseSchema = z.object({ jobId: z.string().min(1), groupId: z.string().min(1), publicId: z.string().min(1) });
export const ticketResponseSchema = z.object({
  bookingCode: z.string().min(1), totalOdds: z.number().finite(), selectionCount: z.number().int().nonnegative(),
  selections: z.array(z.object({ homeTeam: z.string(), awayTeam: z.string(), league: z.string(), marketName: z.string(), selectionName: z.string(), odds: z.number().finite() }).passthrough()),
}).passthrough();
export const collectionResponseSchema = z.object({ publicId: z.string().min(1), title: z.string(), slips: z.array(ticketResponseSchema) }).passthrough();

export function generationOutcome(job: { id: string; requestId?: string | null; requestedCount?: number; status: string; total: number; progress: number; failedCount: number; failures?: unknown; error?: string | null }): GenerationOutcome {
  const terminal = job.status === 'COMPLETED' || job.status === 'FAILED';
  const requested = Math.max(job.requestedCount ?? 0, job.total);
  const generated = Math.max(0, Math.min(job.total, job.progress) - job.failedCount);
  const errors = z.array(generationFailureSchema).safeParse(job.failures ?? []);
  const failures = errors.success ? [...errors.data] : [];
  if (terminal && job.status === 'FAILED' && job.error && !failures.length) failures.push({ code: 'UNEXPECTED_ERROR', message: job.error, retryable: true });
  const shortage = Math.max(0, requested - job.total);
  const failedBeforePlanning = job.status === 'FAILED' && job.total === 0 && !!job.error;
  if (terminal && shortage && !failedBeforePlanning) failures.push({ code: 'SHORTAGE', message: `${shortage} tickets could not be planned within the requested constraints and diversification limits.`, retryable: false });
  return { requestId: job.requestId ?? job.id, status: !terminal ? 'loading' : generated === requested && generated > 0 ? 'success' : generated > 0 ? 'partial_success' : failures.some(failure => failure.code !== 'SHORTAGE') ? 'failed' : 'empty', requested, generated, failed: terminal ? requested - generated : job.failedCount, errors: failures };
}

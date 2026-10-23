import { ApiError, type JobProgress } from './api';

export function permanentResultError(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 403, 404, 409, 410, 422].includes(error.status);
}
export function retryResultRead(count: number, error: unknown): boolean {
  return count < 2 && !permanentResultError(error);
}
export function resultReadInterval(error: unknown, failures = 0): number | false {
  return permanentResultError(error) ? false : error ? Math.min(15000, 1500 * 2 ** Math.min(failures, 4)) : 1500;
}
/** Either safe read can carry job progress; prefer the most recently updated snapshot. */
export function freshestResultJob(job?: JobProgress, embedded?: Pick<JobProgress, 'status' | 'progress' | 'total' | 'failedCount' | 'error' | 'outcome' | 'updatedAt'> | null) {
  if (!job) return embedded ?? undefined;
  if (!embedded) return job;
  const embeddedTime = Date.parse(embedded.updatedAt ?? '') || 0;
  const jobTime = Date.parse(job.updatedAt ?? '') || 0;
  return embeddedTime > jobTime ? embedded : job;
}

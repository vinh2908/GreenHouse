/**
 * R7 item 3: pure overdue predicate for the customer overdue banner.
 *
 * The banner renders exactly when the job's scheduled start has passed AND
 * no helper is assigned yet — the same rule as the server's
 * `isPastStartUnassigned` (jobs.service.ts), mirrored here so the client can
 * decide synchronously. It NEVER renders for assigned / in-progress jobs
 * (helper_id set) or for jobs without a usable start time (flexible jobs).
 *
 * Pure TS, zero imports except the shared VN wall-clock math from
 * ./job-schedule-edit (also import-free), so the API jest harness can import
 * it via `@/utils/job-overdue`.
 */
import { dateKeyOf, startInstantMs } from './job-schedule-edit';

export interface OverdueJobLike {
  preferred_date?: string | Date | null;
  preferred_time_start?: string | null;
  helper_id?: unknown;
}

export function isOverdueUnassigned(
  job: OverdueJobLike | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!job) return false;
  if (job.helper_id !== null && job.helper_id !== undefined) return false;
  const date = dateKeyOf(job.preferred_date);
  const instant = startInstantMs(date, job.preferred_time_start ?? '');
  if (instant === null) return false;
  return instant < nowMs;
}

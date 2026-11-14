/**
 * R7 item 3: pure overdue predicate for the customer overdue banner.
 *
 * The banner renders exactly when the job's scheduled start has passed AND
 * no helper is assigned yet AND the job is still open for quotes — the same
 * rule as the server's `isPastStartUnassigned` (jobs.service.ts), mirrored
 * here so the client can decide synchronously. It NEVER renders for assigned
 * / in-progress jobs (helper_id set) or for jobs without a usable start time
 * (flexible jobs).
 *
 * R8 item 1: the status gate. Without it a CANCELLED job (helper null, past
 * start — exactly what the R7 auto-cancel sweep produces 5 min after the
 * start) still satisfied the predicate and showed the banner with
 * reschedule / re-broadcast / cancel actions — nonsense on a cancelled job.
 * Only JobStatus OPEN ('open') and RECEIVING_QUOTES ('receiving_quotes')
 * can be overdue; every other status (cancelled, completed, disputed,
 * expired, confirmed, quote_selected, …) — and a missing status — is false.
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
  /** JobStatus string ('open' | 'receiving_quotes' | 'cancelled' | …). */
  status?: string | null;
}

export function isOverdueUnassigned(
  job: OverdueJobLike | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!job) return false;
  // R8 item 1: only jobs still open for quotes can be overdue. A cancelled
  // (or completed / disputed / expired / confirmed / …) job has no helper
  // and a past start by construction, so it must never show the banner.
  if (job.status !== 'open' && job.status !== 'receiving_quotes') return false;
  if (job.helper_id !== null && job.helper_id !== undefined) return false;
  const date = dateKeyOf(job.preferred_date);
  const instant = startInstantMs(date, job.preferred_time_start ?? '');
  if (instant === null) return false;
  return instant < nowMs;
}

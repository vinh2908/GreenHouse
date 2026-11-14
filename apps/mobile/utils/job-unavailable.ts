/**
 * R8-B: pure predicate for the "job no longer available" detail state.
 *
 * Live 2026-11-14: a helper opening the detail of a job that had just been
 * auto-cancelled (R7 start + 5 min rule) saw the generic "cannot connect to
 * server" error, even though the API was up. Root cause: getJobForUser
 * answered a non-owner helper's request for a non-browsable job with 403
 * Forbidden — the same status as a genuinely forbidden request (private
 * offer for another helper, unverified helper) — and the page rendered ANY
 * detail-fetch failure as a connection error.
 *
 * FIX: the API answers a non-browsable job (cancelled, expired, completed,
 * already assigned to someone else, …) with HTTP 410 Gone — the status
 * that means "this resource is no longer available" — while private-offer
 * and unverified-helper refusals stay 403. This predicate matches ONLY
 * the 410 case (by status, or by the `Gone` error code the API filter
 * emits for it), so real network/server failures (5xx, timeout, no
 * response) and real 403s still render the generic connection error.
 *
 * Pure TS, zero imports, so the API jest harness can import it via
 * `@/utils/job-unavailable` (same pattern as `@/utils/job-overdue`).
 */
export function isJobNoLongerAvailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {
    response?: { status?: unknown; data?: { error?: { code?: unknown } } };
    status?: unknown;
  };
  const status = err.response?.status ?? err.status;
  if (status === 410) return true;
  const code = err.response?.data?.error?.code;
  if (typeof code === 'string' && code.toLowerCase() === 'gone') return true;
  return false;
}

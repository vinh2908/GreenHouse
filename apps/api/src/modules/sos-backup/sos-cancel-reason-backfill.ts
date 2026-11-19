/**
 * R13-B5 — backfill for pre-R12 SOS cancel reasons (display text only).
 *
 * Before R12, `expireSos()` called `cancelJobWithSosPolicy(..., 'timeout')`
 * for EVERY non-customer SOS cancel, so a rematch that expired while
 * looking for a replacement was stored as "khách không phản hồi trong
 * hạn" — wrong whenever the customer had already accepted the rematch.
 * R12 item 21 added the 'rematch_expired' branch for NEW events; rows
 * written before R12 keep the wrong text (live: S1 job
 * 6afb2592914ecfff7b2e1f42, cancelled 22:51 16/11, while its SOS dispatch
 * history says "Hết hạn tìm thợ").
 *
 * Discriminator: an SOS record with `status === 'expired'` proves the
 * broadcast expired — decision-timeout cancels end in `decision_timeout`
 * and never reach `expireSos()`. The corrected text is the exact R12
 * string, so backfilled rows become indistinguishable from post-R12 rows.
 *
 * This module is pure (no DB) so the match rule is unit-testable. The
 * runner script lives at `apps/api/src/scripts/backfill-sos-cancel-reasons.ts`
 * and is DRY-RUN by default — it must NOT be run on production without the
 * owner's explicit call. It rewrites ONLY `cancellation_reason`; it never
 * touches notifications, wallet descriptions, `job.events[]`, money fields,
 * `status`, or `cancelled_by`.
 */

export const SOS_CANCEL_REASON_NO_RESPONSE =
  'sos_backup: khách không phản hồi trong hạn — hủy theo chính sách mặc định';

export const SOS_CANCEL_REASON_REMATCH_EXPIRED =
  'sos_backup: hết hạn tìm thợ thay thế — hủy theo chính sách SOS';

export interface SosCancelReasonBackfillJob {
  status?: string;
  cancellation_reason?: string;
}

export interface SosCancelReasonBackfillSos {
  status?: string;
  customer_decision?: string;
  decided_by?: string;
}

/** True when a cancelled job's stored reason is the pre-R12 wrong text AND its SOS record proves broadcast expiry. */
export function shouldBackfillSosCancelReason(
  job: SosCancelReasonBackfillJob | null | undefined,
  sosRecords: Array<SosCancelReasonBackfillSos | null | undefined> | null | undefined,
): boolean {
  if (!job || job.status !== 'cancelled') return false;
  if (job.cancellation_reason !== SOS_CANCEL_REASON_NO_RESPONSE) return false;
  return (sosRecords ?? []).some(s => s?.status === 'expired');
}

/** Maps the old wrong text to the corrected R12 text; null for anything else (idempotent — already-correct rows are untouched). */
export function correctedSosCancelReason(oldReason: string | null | undefined): string | null {
  return oldReason === SOS_CANCEL_REASON_NO_RESPONSE ? SOS_CANCEL_REASON_REMATCH_EXPIRED : null;
}

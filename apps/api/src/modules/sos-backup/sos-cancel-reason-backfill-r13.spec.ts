import {
  SOS_CANCEL_REASON_NO_RESPONSE,
  SOS_CANCEL_REASON_REMATCH_EXPIRED,
  correctedSosCancelReason,
  shouldBackfillSosCancelReason,
} from './sos-cancel-reason-backfill';

/**
 * R13-B5 — match predicate + mapping for the SOS cancel-reason backfill.
 * Pure functions, no DB. The runner script is dry-run by default and must
 * NOT be run on production without the owner's explicit call.
 *
 * FAILS on base d06aa9c: the backfill module does not exist (import error).
 */
describe('R13-B5: SOS cancel-reason backfill match rule', () => {
  const oldJob = { status: 'cancelled', cancellation_reason: SOS_CANCEL_REASON_NO_RESPONSE };
  const expiredSos = [{ status: 'expired', customer_decision: 'accept_replacement', decided_by: 'customer' }];

  it('cancelled + old reason + expired SOS → backfill, mapping is the exact R12 string', () => {
    expect(shouldBackfillSosCancelReason(oldJob, expiredSos)).toBe(true);
    expect(correctedSosCancelReason(SOS_CANCEL_REASON_NO_RESPONSE)).toBe(
      SOS_CANCEL_REASON_REMATCH_EXPIRED,
    );
  });

  it('decision-timeout SOS (no expired record) → no backfill', () => {
    expect(
      shouldBackfillSosCancelReason(oldJob, [{ status: 'decision_timeout' }]),
    ).toBe(false);
    expect(shouldBackfillSosCancelReason(oldJob, [])).toBe(false);
    expect(shouldBackfillSosCancelReason(oldJob, null)).toBe(false);
  });

  it('already-correct reason → no backfill (idempotent)', () => {
    expect(
      shouldBackfillSosCancelReason(
        { status: 'cancelled', cancellation_reason: SOS_CANCEL_REASON_REMATCH_EXPIRED },
        expiredSos,
      ),
    ).toBe(false);
    expect(correctedSosCancelReason(SOS_CANCEL_REASON_REMATCH_EXPIRED)).toBeNull();
    expect(correctedSosCancelReason('sos_backup: khách chọn hủy đơn sau khi thợ báo sự cố')).toBeNull();
    expect(correctedSosCancelReason(null)).toBeNull();
  });

  it('non-cancelled job → no backfill even with an expired SOS', () => {
    expect(
      shouldBackfillSosCancelReason(
        { status: 'confirmed', cancellation_reason: SOS_CANCEL_REASON_NO_RESPONSE },
        expiredSos,
      ),
    ).toBe(false);
    expect(shouldBackfillSosCancelReason(null, expiredSos)).toBe(false);
  });
});

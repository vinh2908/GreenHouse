// utils/dispute-display.spec.ts — unit test for shouldShowOpenDisputeBanner (R14-L2).
import { shouldShowOpenDisputeBanner } from './dispute-display';

let passed = 0;

function check(actual: boolean, expected: boolean, label: string): void {
  if (actual !== expected) {
    throw new Error(`dispute-display case failed: ${label} — expected ${expected}, got ${actual}`);
  }
  passed += 1;
}

// 1. null / undefined job -> false
check(shouldShowOpenDisputeBanner(null), false, 'null job');
check(shouldShowOpenDisputeBanner(undefined), false, 'undefined job');

// 2. Open dispute without resolution -> true
check(shouldShowOpenDisputeBanner({ status: 'disputed' }), true, 'open dispute without resolution');
check(
  shouldShowOpenDisputeBanner({ status: 'disputed', dispute_resolution: null }),
  true,
  'open dispute with null resolution',
);

// 3. Dispute rejected/resolved with dispute_resolution present -> false
check(
  shouldShowOpenDisputeBanner({
    status: 'disputed',
    dispute_resolution: { action: 'reject_dispute' },
  }),
  false,
  'dispute with resolution object',
);

// 4. Job completed (e.g. Job B2: completed after dispute rejected) -> false
check(
  shouldShowOpenDisputeBanner({
    status: 'completed',
    dispute_resolution: { action: 'reject_dispute' },
  }),
  false,
  'completed job with rejected dispute',
);
check(shouldShowOpenDisputeBanner({ status: 'completed' }), false, 'completed job without dispute');

// 5. Job cancelled -> false
check(shouldShowOpenDisputeBanner({ status: 'cancelled' }), false, 'cancelled job');
check(
  shouldShowOpenDisputeBanner({
    status: 'cancelled',
    dispute_resolution: { action: 'reject_dispute' },
  }),
  false,
  'cancelled job with resolution',
);

// 6. Normal active statuses -> false
check(shouldShowOpenDisputeBanner({ status: 'in_progress' }), false, 'in_progress job');
check(shouldShowOpenDisputeBanner({ status: 'pending_review' }), false, 'pending_review job');

if (passed !== 11) {
  throw new Error(`dispute-display: expected 11 cases, ran ${passed}`);
}
console.log(`dispute-display.spec.ts: all ${passed} cases passed`);

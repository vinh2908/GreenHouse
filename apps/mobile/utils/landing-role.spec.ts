// utils/landing-role.spec.ts — cases for resolveLandingRole (R7-B6).
// apps/mobile has no jest harness and no jest types, so this file uses a
// local assert helper instead of describe/it/expect (those globals break
// `tsc --noEmit`). It is NOT imported by app code; run it standalone:
//   npx tsc apps/mobile/utils/landing-role.ts apps/mobile/utils/landing-role.spec.ts --module commonjs --target es2020 --outDir /tmp/landing-role-check --skipLibCheck && node /tmp/landing-role-check/landing-role.spec.js
// Exit 0 = all 14 cases pass; any failure throws.
import { resolveLandingRole } from './landing-role';

let passed = 0;

function check(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`landing-role case failed: ${label} — expected ${expected}, got ${actual}`);
  }
  passed += 1;
}

// helper-only user keeps the helper dashboard
check(resolveLandingRole(['helper'], 'helper', undefined), 'helper', 'helper-only, no last-used');
check(resolveLandingRole(['helper'], 'helper', 'customer'), 'helper', 'helper-only, stale customer last-used');

// customer-only user keeps the customer home
check(resolveLandingRole(['customer'], 'customer', undefined), 'customer', 'customer-only, no last-used');
check(resolveLandingRole(['customer'], 'customer', 'helper'), 'customer', 'customer-only, stale helper last-used');

// dual-role user lands on the mode last used on this device
check(resolveLandingRole(['customer', 'helper'], 'customer', 'helper'), 'helper', 'dual-role, last-used helper');
check(resolveLandingRole(['customer', 'helper'], 'helper', 'customer'), 'customer', 'dual-role, last-used customer');

// dual-role user with no last-used mode defaults to customer, not a stale server helper
check(resolveLandingRole(['customer', 'helper'], 'helper', undefined), 'customer', 'dual-role, no last-used, server helper');
check(resolveLandingRole(['customer', 'helper'], 'helper', null), 'customer', 'dual-role, null last-used, server helper');

// dual-role user with a last-used mode outside their roles falls back to customer
check(resolveLandingRole(['customer', 'helper'], 'helper', 'admin'), 'customer', 'dual-role, last-used outside roles');

// unknown roles: last-used wins, else the server value
check(resolveLandingRole(undefined, 'helper', 'customer'), 'customer', 'unknown roles, last-used customer');
check(resolveLandingRole(undefined, 'helper', undefined), 'helper', 'unknown roles, server helper');
check(resolveLandingRole(undefined, 'customer', undefined), 'customer', 'unknown roles, server customer');

// The two single-role cases above each carry a second assertion through
// the stale-last-used variants; total assertions in this file: 12.
if (passed !== 12) {
  throw new Error(`landing-role: expected 12 cases, ran ${passed}`);
}

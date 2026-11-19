// utils/last-used-role.spec.ts — unit tests for last-used-role logic (R14-L4).
import {
  normalizePhoneKey,
  getPhoneRoleStorageKey,
  determineLoginLandingRole,
  LAST_USED_ROLE_KEY,
} from './last-used-role';

let passed = 0;

function check(actual: any, expected: any, label: string): void {
  if (actual !== expected) {
    throw new Error(`last-used-role case failed: ${label} — expected ${expected}, got ${actual}`);
  }
  passed += 1;
}

// 1. Phone key normalization
check(normalizePhoneKey('0365290805'), '0365290805', 'plain 10-digit phone');
check(normalizePhoneKey(' 0365 290 805 '), '0365290805', 'phone with spaces');
check(normalizePhoneKey('+84365290805'), '0365290805', 'phone with +84');
check(normalizePhoneKey(null), null, 'null phone');
check(normalizePhoneKey(undefined), null, 'undefined phone');

// 2. Storage key generation
check(
  getPhoneRoleStorageKey('0365290805'),
  `${LAST_USED_ROLE_KEY}_0365290805`,
  'phone role key format',
);
check(getPhoneRoleStorageKey(null), null, 'null phone storage key');

// 3. Dual-role user landing resolution (e.g. 0365290805 with customer & helper)
const dualRoleUser = {
  roles: ['customer', 'helper'],
  active_role: 'customer', // server might have defaulted to customer
};

// When user last used helper mode on device/account:
check(
  determineLoginLandingRole(dualRoleUser, 'helper'),
  'helper',
  'dual-role user with lastUsedRole=helper lands on helper',
);

// When user last used customer mode:
check(
  determineLoginLandingRole(dualRoleUser, 'customer'),
  'customer',
  'dual-role user with lastUsedRole=customer lands on customer',
);

// When user has no last used role recorded yet, falls back to customer safely:
check(
  determineLoginLandingRole(dualRoleUser, null),
  'customer',
  'dual-role user without lastUsedRole defaults to customer',
);

// Single role helper user always lands on helper regardless of last-used:
const helperOnlyUser = { roles: ['helper'], active_role: 'helper' };
check(
  determineLoginLandingRole(helperOnlyUser, 'customer'),
  'helper',
  'helper-only user always lands on helper',
);

// Single role customer user always lands on customer:
const customerOnlyUser = { roles: ['customer'], active_role: 'customer' };
check(
  determineLoginLandingRole(customerOnlyUser, 'helper'),
  'customer',
  'customer-only user always lands on customer',
);

if (passed !== 12) {
  throw new Error(`last-used-role: expected 12 cases, ran ${passed}`);
}
console.log(`last-used-role.spec.ts: all ${passed} cases passed`);

// utils/landing-role.ts — R7-B6 (live 2026-11-14 ~09:28): after sign-in a
// customer session had landed on the helper dashboard, so the customer saw
// the job in helper mode (and, before the server owner override, an empty
// quote list). The post-login landing role is decided here, in one pure
// place, so it can be unit-checked without the auth store:
//
//   1. A single-role user always lands on their only mode — a helper-only
//      account keeps the helper dashboard, a customer-only account the
//      customer home. This rule never changes.
//   2. A dual-role user lands on the mode last used ON THIS DEVICE (the
//      stored role), when it is one of their roles.
//   3. Otherwise a customer-owned session lands on customer mode — the
//      server's persisted active_role may be a stale 'helper' from an
//      earlier switch on another device, and customer is the safe default.
//      (The server owner override in getJobQuotes covers the quotes list
//      even when the session is in helper mode; this rule fixes the landing
//      itself.)
//
// The resolved role is LOCAL only: it is stored as the device's last-used
// mode and drives navigation (splash + post-login redirect both read
// user.active_role from the auth store). It does NOT call the server
// switch-role endpoint and does NOT mint a new JWT — the in-app role switch
// (useSwitchRole) is still the only path that persists a role change
// server-side, and it keeps working both ways.

export type LandingRole = 'customer' | 'helper';

export function resolveLandingRole(
  roles: unknown,
  serverActiveRole: unknown,
  lastUsedRole?: unknown,
): LandingRole {
  // Roles unknown (partial user object): trust the stored last-used mode,
  // else the server value — never guess a mode from nothing.
  if (!Array.isArray(roles)) {
    if (lastUsedRole === 'customer' || lastUsedRole === 'helper') return lastUsedRole;
    return serverActiveRole === 'helper' ? 'helper' : 'customer';
  }

  const hasCustomer = roles.includes('customer');
  const hasHelper = roles.includes('helper');

  // Single-role users: their only mode.
  if (hasCustomer && !hasHelper) return 'customer';
  if (hasHelper && !hasCustomer) return 'helper';

  // Dual-role: the mode last used on this device wins.
  if (lastUsedRole === 'customer' && hasCustomer) return 'customer';
  if (lastUsedRole === 'helper' && hasHelper) return 'helper';

  // No usable last-used mode: customer is the default for a customer-owned
  // session; a helper-only session has already returned above.
  if (hasCustomer) return 'customer';
  if (hasHelper) return 'helper';

  // No roles at all: fall back to the server value.
  return serverActiveRole === 'helper' ? 'helper' : 'customer';
}

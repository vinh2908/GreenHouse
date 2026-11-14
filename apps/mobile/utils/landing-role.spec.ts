// utils/landing-role.spec.ts — cases for resolveLandingRole (R7-B6).
// apps/mobile has no jest harness, so this file documents the contract;
// the cases are executed by transpiling the util and running node asserts
// (see the R7-B report). Keep both in sync.
import { resolveLandingRole } from './landing-role';

describe('resolveLandingRole (R7-B6 login landing)', () => {
  it('helper-only user keeps the helper dashboard', () => {
    expect(resolveLandingRole(['helper'], 'helper', undefined)).toBe('helper');
    expect(resolveLandingRole(['helper'], 'helper', 'customer')).toBe('helper');
  });

  it('customer-only user keeps the customer home', () => {
    expect(resolveLandingRole(['customer'], 'customer', undefined)).toBe('customer');
    expect(resolveLandingRole(['customer'], 'customer', 'helper')).toBe('customer');
  });

  it('dual-role user lands on the mode last used on this device', () => {
    expect(resolveLandingRole(['customer', 'helper'], 'customer', 'helper')).toBe('helper');
    expect(resolveLandingRole(['customer', 'helper'], 'helper', 'customer')).toBe('customer');
  });

  it('dual-role user with no last-used mode defaults to customer, not a stale server helper', () => {
    expect(resolveLandingRole(['customer', 'helper'], 'helper', undefined)).toBe('customer');
    expect(resolveLandingRole(['customer', 'helper'], 'helper', null)).toBe('customer');
  });

  it('dual-role user with a last-used mode outside their roles falls back to customer', () => {
    expect(resolveLandingRole(['customer', 'helper'], 'helper', 'admin')).toBe('customer');
  });

  it('unknown roles: last-used wins, else the server value', () => {
    expect(resolveLandingRole(undefined, 'helper', 'customer')).toBe('customer');
    expect(resolveLandingRole(undefined, 'helper', undefined)).toBe('helper');
    expect(resolveLandingRole(undefined, 'customer', undefined)).toBe('customer');
  });
});

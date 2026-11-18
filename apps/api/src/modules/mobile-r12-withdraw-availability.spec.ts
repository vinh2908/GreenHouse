// modules/mobile-r12-withdraw-availability.spec.ts — R12-17: the "Rút về
// ngân hàng" button was disabled for a 42.500₫ balance with no reason.
// The API minimum is 50.000₫ (RequestWithdrawalDto @Min(50000)), so the
// disabled state is correct — the fix is the reason + the exact shortfall.
// These cases pin the gate the button and the reason text share.
import { getWithdrawAvailability, MIN_WITHDRAWAL_VND } from '@/utils/withdraw-availability';

describe('R12-17: getWithdrawAvailability', () => {
  it('the live case: 42.500₫ cannot withdraw yet, shortfall is 7.500₫', () => {
    expect(getWithdrawAvailability(42500)).toEqual({
      canWithdraw: false,
      shortfallVnd: 7500,
    });
  });

  it('the minimum is 50.000₫', () => {
    expect(MIN_WITHDRAWAL_VND).toBe(50000);
    expect(getWithdrawAvailability(49999).canWithdraw).toBe(false);
    expect(getWithdrawAvailability(50000)).toEqual({ canWithdraw: true, shortfallVnd: 0 });
    expect(getWithdrawAvailability(120000).canWithdraw).toBe(true);
  });

  it('missing / zero balance cannot withdraw', () => {
    expect(getWithdrawAvailability(undefined)).toEqual({
      canWithdraw: false,
      shortfallVnd: 50000,
    });
    expect(getWithdrawAvailability(0).shortfallVnd).toBe(50000);
    expect(getWithdrawAvailability(null).canWithdraw).toBe(false);
  });
});

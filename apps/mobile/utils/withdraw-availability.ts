/**
 * R12-17: withdraw availability for the helper earnings screen.
 *
 * The API enforces the minimum at the DTO layer
 * (RequestWithdrawalDto @Min(50000) in apps/api), so a balance below
 * 50.000₫ genuinely cannot be withdrawn — the button being disabled is
 * CORRECT. The live bug was only that the screen gave NO reason.
 * This pure helper is the single source of truth for the client gate so
 * the button state and the reason text can never drift apart.
 */

export const MIN_WITHDRAWAL_VND = 50000;

export interface WithdrawAvailability {
  /** True when the balance meets the API minimum and the button may open. */
  canWithdraw: boolean;
  /** VND still missing to reach the minimum (0 when canWithdraw). */
  shortfallVnd: number;
}

export function getWithdrawAvailability(balance: number | null | undefined): WithdrawAvailability {
  const b = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0;
  if (b >= MIN_WITHDRAWAL_VND) return { canWithdraw: true, shortfallVnd: 0 };
  return { canWithdraw: false, shortfallVnd: MIN_WITHDRAWAL_VND - b };
}

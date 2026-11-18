// modules/mobile-r12-payment-method-label.spec.ts — R12-18: the VietQR
// receipt printed a bare "Chuyển khoản VietQR" with no simulation marker,
// while the wallet history already labels the same payment "MÔ PHỎNG".
// Old code had the label inline in the receipt screen with no marker;
// these cases fail on the old label and pass after.
import { receiptPaymentMethodLabel } from '@/utils/payment-method-label';

describe('R12-18: receiptPaymentMethodLabel', () => {
  it('VietQR receipt carries the simulation marker', () => {
    expect(receiptPaymentMethodLabel('vietqr', 'vi')).toBe('Chuyển khoản VietQR (MÔ PHỎNG)');
    expect(receiptPaymentMethodLabel('vietqr', 'en')).toBe(
      'Bank Transfer (VietQR) (SIMULATION)',
    );
  });

  it('MoMo / ZaloPay receipts carry the simulation marker too', () => {
    expect(receiptPaymentMethodLabel('momo', 'vi')).toContain('(MÔ PHỎNG)');
    expect(receiptPaymentMethodLabel('zalopay', 'vi')).toContain('(MÔ PHỎNG)');
    expect(receiptPaymentMethodLabel('momo', 'en')).toContain('(SIMULATION)');
  });

  it('real methods (cash, wallet) carry NO simulation marker', () => {
    expect(receiptPaymentMethodLabel('cash', 'vi')).toBe('Tiền mặt trực tiếp');
    expect(receiptPaymentMethodLabel('wallet', 'vi')).toBe('Ví GreenHouse');
    expect(receiptPaymentMethodLabel('cash', 'en')).not.toContain('SIMULATION');
    expect(receiptPaymentMethodLabel('wallet', 'en')).not.toContain('SIMULATION');
  });
});

/**
 * R13-B4 — receipt settlement badge.
 *
 * The old badge only branched on `payment_method`: anything that wasn't
 * literally 'cash' printed "ESCROW SETTLED" — warranty jobs (0₫), jobs
 * whose method was never chosen, and completed-but-UNPAID jobs. The badge
 * must be earned by settlement evidence. The default method label had the
 * same defect: an unset method printed "Thanh toán điện tử".
 *
 * FAILS on base d06aa9c: the badge helper does not exist (import error)
 * and the unset-method label returns 'Thanh toán điện tử'.
 */
import { receiptSettlementBadge } from '@/utils/payment-method-label';

describe('R13-B4: receiptSettlementBadge', () => {
  it('warranty job never earns a settlement badge', () => {
    expect(receiptSettlementBadge({ is_warranty: true, payment_status: 'paid' })).toBe(
      'warranty',
    );
  });

  it('cash counts only when the helper confirmed receipt', () => {
    expect(
      receiptSettlementBadge({ payment_method: 'cash', helper_cash_confirmed: true }),
    ).toBe('cash');
    expect(
      receiptSettlementBadge({
        payment_method: 'cash',
        payment_status: 'paid',
        helper_cash_confirmed: false,
      }),
    ).toBe('unpaid');
    expect(receiptSettlementBadge({ payment_method: 'cash' })).toBe('unpaid');
  });

  it('paid online/wallet jobs earn ESCROW SETTLED; unpaid ones do not', () => {
    expect(receiptSettlementBadge({ payment_method: 'wallet', payment_status: 'paid' })).toBe(
      'escrow',
    );
    expect(receiptSettlementBadge({ payment_method: 'vietqr', payment_status: 'paid' })).toBe(
      'escrow',
    );
    expect(
      receiptSettlementBadge({ payment_method: 'vietqr', payment_status: 'unpaid' }),
    ).toBe('unpaid');
    expect(receiptSettlementBadge({ payment_status: 'unpaid' })).toBe('unpaid');
    expect(receiptSettlementBadge({})).toBe('unpaid');
    expect(receiptSettlementBadge(null)).toBe('unpaid');
  });

  it('unset payment method does not claim an electronic payment', () => {
    expect(receiptPaymentMethodLabel(undefined, 'vi')).toBe('Chưa chọn phương thức');
    expect(receiptPaymentMethodLabel(null, 'en')).toBe('—');
    expect(receiptPaymentMethodLabel('', 'vi')).toBe('Chưa chọn phương thức');
  });
});

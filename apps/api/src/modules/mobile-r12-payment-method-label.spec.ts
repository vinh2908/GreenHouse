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

/**
 * R12-18: payment-method label for the job receipt (app/receipt/[jobId].tsx).
 *
 * VietQR / MoMo / ZaloPay have NO real payment gateway in this app — the
 * API DTO states it plainly ("VietQR/MoMo/ZaloPay là thanh toán MÔ PHỎNG
 * (demo, chưa có cổng thanh toán thật...)") — so every online payment by
 * those methods is a simulation. The wallet history already labels such
 * transactions "MÔ PHỎNG"; the receipt must match instead of printing a
 * bare "Chuyển khoản VietQR" that reads like real money moved. Cash and
 * GreenHouse Wallet are real, so they carry no simulation marker.
 */

export type ReceiptPaymentMethod = string | null | undefined;

export function receiptPaymentMethodLabel(
  method: ReceiptPaymentMethod,
  lang: 'vi' | 'en' = 'vi',
): string {
  const sim = lang === 'en' ? '(SIMULATION)' : '(MÔ PHỎNG)';
  switch (method) {
    case 'wallet':
      return lang === 'en' ? 'GreenHouse Wallet' : 'Ví GreenHouse';
    case 'momo':
      return lang === 'en'
        ? `MoMo / ZaloPay ${sim}`
        : `Ví điện tử MoMo / ZaloPay ${sim}`;
    case 'vietqr':
      return lang === 'en' ? `Bank Transfer (VietQR) ${sim}` : `Chuyển khoản VietQR ${sim}`;
    case 'zalopay':
      return lang === 'en' ? `ZaloPay ${sim}` : `ZaloPay ${sim}`;
    case 'cash':
      return lang === 'en' ? 'Direct Cash' : 'Tiền mặt trực tiếp';
    default:
      return lang === 'en' ? 'Electronic Payment' : 'Thanh toán điện tử';
  }
}

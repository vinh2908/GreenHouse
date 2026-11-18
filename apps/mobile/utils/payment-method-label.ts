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
      // R13-B4: phương thức chưa chọn thì đừng khẳng định "Thanh toán điện
      // tử" — biên lai đơn chưa chọn phương thức in nhãn đó là sai. Chỉ
      // giữ nhãn điện tử cho method lạ đã có giá trị.
      return method
        ? (lang === 'en' ? 'Electronic Payment' : 'Thanh toán điện tử')
        : (lang === 'en' ? '—' : 'Chưa chọn phương thức');
  }
}

/**
 * R13-B4: settlement badge for the job receipt (app/receipt/[jobId].tsx).
 *
 * The old badge only branched on `payment_method`: anything that wasn't
 * literally 'cash' printed "ESCROW SETTLED" — including warranty jobs
 * (0₫ by definition) and jobs whose method was never chosen / never paid.
 * "Escrow settled" must be earned by settlement evidence, not by the
 * absence of the word 'cash':
 * - warranty → 'warranty' (no settlement claim, amount 0₫);
 * - cash + helper_cash_confirmed → 'cash' (paid directly, verified);
 * - payment_status 'paid' (wallet or simulated online) → 'escrow' — the
 *   simulation marker already rides in the method label below the amount,
 *   and R12 live-verified the VietQR receipt with this badge;
 * - everything else (unpaid, method unset, cash not yet confirmed) →
 *   'unpaid' (no settlement badge, amount 0₫).
 */
export type ReceiptSettlementKind = 'warranty' | 'cash' | 'escrow' | 'unpaid';

export interface ReceiptSettlementJob {
  is_warranty?: boolean;
  payment_method?: string | null;
  payment_status?: string | null;
  helper_cash_confirmed?: boolean;
}

export function receiptSettlementBadge(
  job: ReceiptSettlementJob | null | undefined,
): ReceiptSettlementKind {
  if (!job) return 'unpaid';
  if (job.is_warranty === true) return 'warranty';
  if (job.payment_method === 'cash') {
    return job.helper_cash_confirmed === true ? 'cash' : 'unpaid';
  }
  return job.payment_status === 'paid' ? 'escrow' : 'unpaid';
}

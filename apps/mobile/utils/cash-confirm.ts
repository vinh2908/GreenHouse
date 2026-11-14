// utils/cash-confirm.ts — B5g: nút "Xác nhận đã nhận tiền mặt" của thợ.
//
// Vấn đề: server ĐÃ có endpoint POST /jobs/:id/confirm-cash
// (jobsService.confirmCashPayment — chỉ set helper_cash_confirmed = true cho
// thợ của đơn) nhưng app KHÔNG có UI nào gọi nó — nên nghiệm thu tiền mặt
// không bao giờ thỏa được cổng P0-4 ở approveCompletion (yêu cầu
// helper_cash_confirmed hoặc giao dịch tiền mặt đã ghi nhận) và đơn tiền mặt
// kẹt ở bước 7. Nút này vá đường gọi còn thiếu đó.
//
// Quy tắc hiện nút (thuần để jest của apps/api kiểm chứng được — apps/mobile
// chưa có jest harness, cùng pattern với utils/evidence-reupload.ts):
//  - đơn đang pending_review (bước 7, chờ nghiệm thu) VÀ người xem là thợ
//    được giao đơn đó;
//  - VÀ luồng thanh toán là tiền mặt: payment_method === 'cash', HOẶC chưa
//    ghi nhận phương thức online nào — khách chỉ chọn phương thức ở bước
//    nghiệm thu (mặc định 'cash' ở màn khách), nên ở bước 7 payment_method
//    thường còn trống; trống + chưa thanh toán online thì coi là tiền mặt,
//    còn đã paid thì không (tiền online đã được ghi nhận);
//  - KHÔNG bao giờ hiện cho đơn online (vietqr / momo / zalopay / wallet),
//    đơn bảo hành (P0-4 miễn cổng tiền mặt cho is_warranty nên nút vô nghĩa),
//    hoặc khi thợ đã xác nhận rồi (server set lại cũng vô hại nhưng nút thừa).
//
// Hàm thuần (không import React Native).

import { resolveApprovalErrorMessage, type ApprovalLang } from './approval-error';

export interface CashConfirmJobInput {
  status?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  helper_cash_confirmed?: boolean | null;
  is_warranty?: boolean | null;
}

/** Các phương thức online — đơn dùng một trong các này thì KHÔNG phải tiền mặt. */
export const ONLINE_PAYMENT_METHODS = ['vietqr', 'momo', 'wallet', 'zalopay'] as const;

export function normalizePaymentMethod(method: string | null | undefined): string {
  return typeof method === 'string' ? method.trim().toLowerCase() : '';
}

export function isOnlinePaymentMethod(method: string | null | undefined): boolean {
  return (ONLINE_PAYMENT_METHODS as readonly string[]).includes(normalizePaymentMethod(method));
}

/**
 * Luồng thanh toán của đơn có phải tiền mặt không:
 *  - 'cash' → tiền mặt;
 *  - phương thức online đã ghi nhận (vietqr/momo/wallet/zalopay) → không;
 *  - chưa có phương thức (khách chưa chọn ở bước nghiệm thu) → tiền mặt
 *    chỉ khi chưa có thanh toán online nào được ghi nhận (payment_status
 *    !== 'paid'); đơn bảo hành không có luồng thanh toán nên không phải.
 */
export function isCashPaymentFlow(job: CashConfirmJobInput | null | undefined): boolean {
  if (!job || job.is_warranty === true) return false;
  const method = normalizePaymentMethod(job.payment_method);
  if (method === 'cash') return true;
  if (method) return false;
  return job.payment_status !== 'paid';
}

/**
 * Nút "Xác nhận đã nhận tiền mặt" chỉ hiện ở bước 7 pending_review, chỉ với
 * thợ được giao đơn, chỉ khi luồng là tiền mặt, và chỉ khi thợ chưa xác nhận.
 */
export function shouldShowCashConfirmButton(
  job: CashConfirmJobInput | null | undefined,
  isMyActiveJob: boolean,
): boolean {
  if (job?.status !== 'pending_review') return false;
  if (isMyActiveJob !== true) return false;
  if (job?.helper_cash_confirmed === true) return false;
  return isCashPaymentFlow(job);
}

/** Lỗi xác nhận tiền mặt → thông báo hiện được (inline + toast phụ). */
export function resolveCashConfirmErrorMessage(err: unknown, lang: ApprovalLang = 'vi'): string {
  return resolveApprovalErrorMessage(
    err,
    lang,
    lang === 'en'
      ? 'Failed to confirm cash receipt. Please try again.'
      : 'Xác nhận nhận tiền mặt thất bại. Vui lòng thử lại.',
  );
}

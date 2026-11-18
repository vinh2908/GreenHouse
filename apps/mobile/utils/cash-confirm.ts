// utils/cash-confirm.ts — B5g: nút "Xác nhận đã nhận tiền mặt" của thợ.
//
// Vấn đề: server ĐÃ có endpoint POST /jobs/:id/confirm-cash
// (jobsService.confirmCashPayment — chỉ set helper_cash_confirmed = true cho
// thợ của đơn) nhưng app KHÔNG có UI nào gọi nó — nên nghiệm thu tiền mặt
// không bao giờ thỏa được cổng P0-4 ở approveCompletion (R10: CHỈ
// helper_cash_confirmed mới mở gate) và đơn tiền mặt kẹt ở bước 7. Nút này
// vá đường gọi còn thiếu đó.
//
// Quy tắc hiện nút (thuần để jest của apps/api kiểm chứng được — apps/mobile
// chưa có jest harness, cùng pattern với utils/evidence-reupload.ts):
//  - đơn đang pending_review (bước 7, chờ nghiệm thu) VÀ người xem là thợ
//    được giao đơn đó, VÀ phương thức tiền mặt ĐÃ GHI NHẬN
//    (payment_method === 'cash', R12-20 — trước đây heuristic "chưa chọn
//    phương thức = tiền mặt" làm nút hiện cả trên đơn khách định trả
//    VietQR/ví);
//  - HOẶC đơn đang tranh chấp mở từ bước 7 (R12-2): tranh chấp làm đơn rời
//    pending_review nên nút biến mất, trong khi cả 3 hướng phân xử đều cần
//    cờ này — lúc tranh chấp khách không thể ghi nhận phương thức (pay bị
//    chặn ở DISPUTED) nên giữ heuristic cũ (cash, hoặc chưa chọn + chưa
//    thanh toán); đơn online đã ghi nhận vẫn không hiện;
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
 *  Heuristic "chưa chọn = tiền mặt" chỉ dùng được khi KHÔNG còn cách nào
 *  ghi nhận phương thức — tức lúc đơn đang tranh chấp (pay bị chặn ở
 *  DISPUTED, xem confirmCashPayment phía server). Ở bước 7 thì dùng
 *  isExplicitCashFlow (R12-20): phương thức được ghi nhận khi khách bấm trả
 *  ở bước nghiệm thu, và lỗi cổng P0-4 ở lần nghiệm thu đầu đã hướng dẫn
 *  khách yêu cầu thợ xác nhận rồi bấm lại.
 */
export function isCashPaymentFlow(job: CashConfirmJobInput | null | undefined): boolean {
  if (!job || job.is_warranty === true) return false;
  const method = normalizePaymentMethod(job.payment_method);
  if (method === 'cash') return true;
  if (method) return false;
  return job.payment_status !== 'paid';
}

/**
 * R12-20: đơn ĐÃ GHI NHẬN là tiền mặt (payment_method === 'cash').
 * Nút xác nhận tiền mặt ở bước 7 chỉ hiện cho đơn này — nút cũ dùng
 * isCashPaymentFlow nên hiện cả cho đơn chưa chọn phương thức, tức cả đơn
 * khách định trả VietQR/ví (phương thức chỉ được chọn ở bước nghiệm thu).
 */
export function isExplicitCashFlow(job: CashConfirmJobInput | null | undefined): boolean {
  if (!job || job.is_warranty === true) return false;
  return normalizePaymentMethod(job.payment_method) === 'cash';
}

/**
 * Nút "Xác nhận đã nhận tiền mặt" chỉ hiện ở bước 7 pending_review (luồng
 * tiền mặt ĐÃ GHI NHẬN) hoặc khi đơn đang tranh chấp mở từ bước 7
 * (R12-2: tranh chấp làm đơn rời pending_review nên nút biến mất, trong khi
 * cả 3 hướng phân xử đều cần cờ này — deadlock), chỉ với thợ được giao đơn,
 * và chỉ khi thợ chưa xác nhận.
 */
export function shouldShowCashConfirmButton(
  job: CashConfirmJobInput | null | undefined,
  isMyActiveJob: boolean,
): boolean {
  if (job?.status !== 'pending_review' && job?.status !== 'disputed') return false;
  if (isMyActiveJob !== true) return false;
  if (job?.helper_cash_confirmed === true) return false;
  // Đơn tranh chấp: khách không thể ghi nhận phương thức (pay bị chặn ở
  // DISPUTED) nên giữ heuristic isCashPaymentFlow; đơn online đã ghi nhận
  // vẫn bị loại. Đơn ở bước 7: chỉ tiền mặt đã ghi nhận (R12-20).
  return job.status === 'disputed' ? isCashPaymentFlow(job) : isExplicitCashFlow(job);
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

// utils/approval-error.ts — B5c: mọi lỗi ở luồng nghiệm thu/thanh toán của
// khách PHẢI hiện được cho khách thấy.
//
// Cơ chế câm đã chứng minh live 2026-11-13 (đơn B 6af59e07bb2b94f98da7e088):
// khách bấm "Xác nhận nghiệm thu & Thanh toán" ở bước 7 pending_review, đơn
// 0 ảnh hoàn thành — và KHÔNG có gì xảy ra: không toast, không lỗi, đơn ở
// yên bước 7, ví không trừ tiền.
//
// handleSubmitReview (apps/mobile/app/job-detail/[id].tsx ~850) ĐÃ chạy và
// ĐÃ toast: cổng P0-3 refetch rồi thấy completion_photos rỗng nên
// Toast.show({ text1: 'Thợ chưa tải ảnh bằng chứng hoàn thành', ... }) rồi
// return — pay/approve không bao giờ chạy (ví không trừ là ĐÚNG). Toast đó
// vô hình vì ToastCard duy nhất hiện được toast nằm ở root
// (apps/mobile/app/_layout.tsx ~182, position 'absolute', KHÔNG zIndex),
// còn review Modal là RN <Modal> — trên web react-native-web render Modal
// bằng createPortal vào một div mới append vào document.body (SAU app root,
// không zIndex hai bên nên thứ tự DOM quyết định: modal phủ lên ToastCard),
// nội dung modal là View full-screen opaque. Trên native cũng vậy: Modal
// là layer riêng phủ toàn bộ view hierarchy. Toast chỉ sống ~4s rồi tắt —
// toàn bộ thời gian đó nó nằm SAU modal đang mở. Toast ở màn khác (không
// modal mở, vd thợ gửi bằng chứng) vẫn thấy được live, nên đây không phải
// lỗi mount Toast mà là lỗi toast-nằm-sau-modal.
//
// Vì vậy bản sửa KHÔNG thay toast: mọi lỗi ở luồng này còn được ghi vào
// reviewError — banner đỏ inline ĐÃ CÓ sẵn trong modal (chỉ dùng cho lỗi
// lưu đánh giá trước đây) — để khách thấy lỗi ngay trong modal đang mở.
// Toast giữ nguyên làm kênh phụ (nó sẽ thấy được khi modal đóng).
//
// Hàm thuần (không import React Native) để có thể kiểm chứng bằng jest của
// apps/api — apps/mobile chưa có jest harness (xem apps/mobile/utils/
// job-assignment.ts và spec B4-R2 dùng chung pattern này).

export type ApprovalLang = 'vi' | 'en';

const FALLBACK: Record<ApprovalLang, string> = {
  vi: 'Gửi nghiệm thu thất bại',
  en: 'Submission failed',
};

/** Thông báo kỹ thuật của axios/fetch — không bao giờ hiện nguyên văn cho khách. */
const TECHNICAL_MESSAGE = /network error|timeout|ECONNABORTED|ETIMEDOUT|ENOTFOUND|fetch failed/i;

function asDisplayString(value: unknown): string | null {
  if (typeof value === 'string') {
    const s = value.trim();
    return s ? s : null;
  }
  if (Array.isArray(value)) {
    // Nest trả message dạng string[] (lỗi validation) — Toast/banner nhận
    // array sẽ render rỗng/lạ, nên nối thành một chuỗi đọc được.
    const parts = value
      .map(v => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
      .filter(Boolean);
    return parts.length ? parts.join('; ') : null;
  }
  return null;
}

/**
 * Lấy thông báo lỗi hiện được cho khách từ lỗi axios/server ở luồng nghiệm
 * thu/thanh toán:
 *  - message server (string) → nguyên văn, kể cả thông báo B57
 *    'Chưa có ảnh bằng chứng hoàn thành...' từ approveCompletion;
 *  - message server dạng string[] → nối bằng '; ' thành một chuỗi;
 *  - không có message server (lỗi mạng/timeout/lỗi lạ) → fallback đọc được
 *    theo ngôn ngữ, KHÔNG hiện text kỹ thuật ('Network Error', 'timeout...').
 * `fallback` cho phép giữ thông báo riêng của từng bước (vd bước lưu đánh
 * giá: 'Nghiệm thu thành công nhưng chưa lưu được đánh giá...').
 */
export function resolveApprovalErrorMessage(
  err: unknown,
  lang: ApprovalLang = 'vi',
  fallback?: string,
): string {
  const fallbackMsg = fallback ?? FALLBACK[lang] ?? FALLBACK.vi;
  if (err == null) return fallbackMsg;
  const serverMessage = asDisplayString(
    (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message,
  );
  if (serverMessage) return serverMessage;
  const plainMessage = asDisplayString((err as { message?: unknown })?.message);
  if (plainMessage && !TECHNICAL_MESSAGE.test(plainMessage)) return plainMessage;
  return fallbackMsg;
}

/** Tiêu đề + chi tiết của cổng P0-3: thợ chưa tải ảnh bằng chứng hoàn thành. */
export function missingCompletionEvidenceText(lang: ApprovalLang = 'vi'): {
  title: string;
  detail: string;
} {
  if (lang === 'en') {
    return {
      title: 'Helper has not uploaded completion photos yet',
      detail: 'Ask the helper to upload completion photos before approval — no payment was taken.',
    };
  }
  return {
    title: 'Thợ chưa tải ảnh bằng chứng hoàn thành',
    detail: 'Hãy yêu cầu thợ tải ảnh hoàn thành trước khi nghiệm thu — chưa trừ tiền.',
  };
}

/**
 * B5f: sau khi pay lỗi "đã được thanh toán" và refetch, CHỈ được proceed
 * approve khi job refetch thấy payment_status === 'paid'.
 *
 * Cơ chế đã chứng minh live 2026-11-13 (đơn B 6af59e07bb2b94f98da7e088):
 * pay lần đầu kẹt PROCESSING, server trả Conflict "Đơn hàng này đã được
 * thanh toán hoặc đang được xử lý thanh toán" — client cũ match regex
 * /đã được thanh toán|already paid/i rồi coi như "đã trả rồi" và approve
 * luôn, nhưng approve ném "Đơn hàng chưa được thanh toán trực tuyến thành
 * công" vì payment_status vẫn PROCESSING, không phải PAID. Message lỗi pay
 * KHÔNG chứng minh được tiền đã trừ — chỉ payment_status === 'paid' trên
 * job refetch mới chứng minh được.
 */
export function alreadyPaidRefetchAllowsApprove(refetchedJob: unknown): boolean {
  return (
    (refetchedJob as { payment_status?: unknown } | null | undefined)?.payment_status === 'paid'
  );
}

/** Thông báo khi refetch sau lỗi "đã được thanh toán" vẫn chưa thấy paid. */
export function unfinishedPaymentText(lang: ApprovalLang = 'vi'): string {
  if (lang === 'en') return 'Payment is not complete yet, please try again.';
  return 'Thanh toán chưa hoàn tất, vui lòng thử lại';
}

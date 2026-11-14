// utils/helper-complete-error.ts — B5d: lỗi gửi bằng chứng hoàn thành của thợ
// PHẢI hiện được cho thợ thấy.
//
// Cơ chế câm giống hệt B5c ở phía khách (xem utils/approval-error.ts): thợ
// bấm gửi trong complete modal (apps/mobile/app/helper-job-detail/[id].tsx),
// uploadFiles/upload 120s hoặc PATCH /jobs/:id/complete lỗi —
// handleCompleteSubmission ĐÃ toast lỗi, nhưng ToastCard duy nhất nằm ở root
// (apps/mobile/app/_layout.tsx, position 'absolute', KHÔNG zIndex) còn
// complete modal là RN <Modal> render qua portal nên modal phủ lên Toast.
// Live 2026-11-13: thợ gửi (1 ảnh + 1 video) xoay rồi lỗi mà KHÔNG có lỗi
// nào hiện. Bản sửa KHÔNG thay toast: lỗi còn được ghi vào completeError —
// banner đỏ inline trong chính modal (cùng pattern setReviewError của B5c) —
// Toast giữ nguyên làm kênh phụ (sẽ thấy khi modal đóng).
//
// Hàm thuần (không import React Native) để có thể kiểm chứng bằng jest của
// apps/api — apps/mobile chưa có jest harness (cùng pattern với
// utils/approval-error.ts, spec B5c). Tái dùng resolveApprovalErrorMessage:
// message server nguyên văn, message dạng array nối lại, lỗi mạng/lạ →
// fallback đọc được theo ngôn ngữ — chỉ khác fallback riêng của bước này.

import { resolveApprovalErrorMessage, type ApprovalLang } from './approval-error';

/** Lỗi gửi bằng chứng hoàn thành → thông báo hiện được trong banner inline. */
export function resolveCompleteErrorMessage(err: unknown, lang: ApprovalLang = 'vi'): string {
  return resolveApprovalErrorMessage(
    err,
    lang,
    lang === 'en'
      ? 'Failed to submit completion evidence. Please try again.'
      : 'Gửi bằng chứng hoàn thành thất bại. Vui lòng thử lại.',
  );
}

/**
 * Banner đỏ inline trong complete modal chỉ hiện khi có thông báo lỗi thật
 * (chuỗi không rỗng). Chuỗi rỗng / chỉ khoảng trắng / null thì không render
 * gì — tránh banner đỏ trống sau khi lỗi đã được xóa.
 */
export function shouldShowCompleteErrorBanner(errorMessage: string | null | undefined): boolean {
  return typeof errorMessage === 'string' && errorMessage.trim().length > 0;
}

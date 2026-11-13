// utils/completion-evidence.ts — B5b: cổng "đủ ảnh nghiệm thu" ở màn chi tiết đơn của thợ.
//
// Vấn đề live 2026-11-13 (đơn B 6af59e07bb2b94f98da7e088): thợ gửi nghiệm thu
// KHÔNG ảnh, KHÔNG video vì app cho phép: handleCompleteSubmission mở Alert
// "evidence_no_media" với nút "Tiếp tục gửi" (evidence_submit_anyway) gọi
// completeJob với mảng rỗng. Server (completeByHelper) cũng nhận mảng rỗng.
// Sau đó cổng B57 ở approveCompletion yêu cầu ≥1 ảnh nên khách bấm nghiệm thu
// là lỗi — đơn kẹt vĩnh viễn ở bước 7 "Chờ nghiệm thu", không ai cứu được
// (PENDING_REVIEW → PENDING_REVIEW cũng không phải transition hợp lệ nên thợ
// không thể bổ sung bằng chứng sau đó).
//
// Vì B57 chỉ đếm ẢNH nên cổng này cũng chỉ đếm ảnh: chỉ có video (không ảnh)
// vẫn bị chặn — gửi nghiệm thu chỉ-video sẽ kẹt y hệt. Chặn ngay tại UI, trước
// khi gọi completeJob, để đơn không bao giờ rơi vào trạng thái kẹt đó.
//
// Hàm thuần (không import React Native) để có thể kiểm chứng bằng jest của
// apps/api — apps/mobile chưa có jest harness (xem apps/mobile/utils/
// job-assignment.ts và spec B4-R2 dùng chung pattern này).

export interface CompletionEvidenceInput {
  photos?: readonly string[] | null;
  videos?: readonly string[] | null;
}

export type CompletionEvidenceGate =
  { allowed: true } | { allowed: false; reason: 'photo-required' };

/**
 * Đủ bằng chứng để gửi nghiệm thu chưa: BẮT BUỘC ≥1 ảnh hoàn thành.
 * Video không thay thế được ảnh (cổng B57 ở approveCompletion chỉ đếm
 * completion_photos). Trả về blocked khi chưa có ảnh — bất kể có video hay
 * không — và allowed khi có ≥1 ảnh.
 */
export function checkCompletionEvidence(
  input: CompletionEvidenceInput | null | undefined,
): CompletionEvidenceGate {
  const photoCount = Array.isArray(input?.photos) ? input.photos.length : 0;
  if (photoCount === 0) {
    return { allowed: false, reason: 'photo-required' };
  }
  return { allowed: true };
}

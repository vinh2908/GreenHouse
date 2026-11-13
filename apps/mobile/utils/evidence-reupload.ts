// utils/evidence-reupload.ts — R4: helper re-upload completion evidence at
// pending_review.
//
// Vấn đề live 2026-11-13 (đơn B 6af59e07bb2b94f98da7e088): đơn kẹt ở bước 7
// pending_review với 0 ảnh hoàn thành. R3 đã thêm nhánh re-upload ở server
// (completeByHelper: job PENDING_REVIEW được cập nhật photos/videos/notes mà
// không đổi trạng thái) nhưng KHÔNG có UI nào gọi nó: UI chụp/chọn ảnh chỉ
// nằm trong modal hoàn thành, mà modal đó chỉ mở từ action 'complete' của
// luồng in_progress — ở bước 7 không còn action đó nên modal không bao giờ mở.
//
// Hai quy tắc thuần ở đây để jest của apps/api kiểm chứng được (apps/mobile
// chưa có jest harness — cùng pattern với utils/completion-evidence.ts, spec
// B5b):
//  (a) nút "Bổ sung ảnh bằng chứng" chỉ hiện khi đơn đang pending_review VÀ
//      người xem là thợ được giao đơn đó.
//  (b) mở modal ở chế độ re-upload phải PREFILL ảnh/video/ghi chú đã lưu của
//      đơn — vì nhánh server REPLACE completion_photos khi DTO có photos
//      (`if (dto.completion_photos?.length) job.completion_photos = ...`).
//      Modal bắt đầu với state rỗng nên không prefill thì thợ thêm 1 ảnh mới
//      sẽ âm thầm xóa hết ảnh cũ. Prefill trả về bản sao mới, không mutate
//      mảng gốc của job.

export interface ReuploadMediaInput {
  completion_photos?: readonly string[] | null;
  completion_videos?: readonly string[] | null;
  completion_notes?: string | null;
}

export interface ReuploadMedia {
  photos: string[];
  videos: string[];
  notes: string;
}

/**
 * Nút bổ sung bằng chứng chỉ hiện ở bước 7 (pending_review) và chỉ với thợ
 * được giao đơn. Mọi trạng thái khác (in_progress, confirmed, completed,
 * disputed, ...) hoặc thợ không phải người được giao đều ẩn.
 */
export function shouldShowEvidenceReupload(
  status: string | null | undefined,
  isMyActiveJob: boolean,
): boolean {
  return status === 'pending_review' && isMyActiveJob === true;
}

/**
 * Prefill modal re-upload từ bằng chứng đã lưu của đơn. Trả về mảng mới
 * (spread copy) để việc xóa/thêm trong modal không mutate job gốc; job
 * thiếu/trống thì trả về mảng rỗng + ghi chú rỗng.
 */
export function prefillReuploadMedia(
  job: ReuploadMediaInput | null | undefined,
): ReuploadMedia {
  return {
    photos: Array.isArray(job?.completion_photos) ? [...job.completion_photos] : [],
    videos: Array.isArray(job?.completion_videos) ? [...job.completion_videos] : [],
    notes: typeof job?.completion_notes === 'string' ? job.completion_notes : '',
  };
}

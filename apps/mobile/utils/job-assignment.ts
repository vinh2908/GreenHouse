// utils/job-assignment.ts — B4: cổng "đơn đang làm của tôi" ở màn chi tiết đơn của thợ.
//
// Vấn đề live 2026-11-12 (đơn B 6af59e07bb2b94f98da7e088): thẻ tiến độ
// ("Cập nhật tiến độ làm việc" + "Bắt đầu di chuyển đến khách") lúc hiện lúc
// ẩn. Nguyên nhân gốc: cổng này trước đây chỉ tin đúng một nguồn —
// job.helper_id trong payload GET /jobs/:id — mà payload đó có thể cũ:
//  - useJobDetail không tự poll (chỉ trông chờ socket event, lỡ là mất),
//  - fetch lỗi mạng/timeout thì trả snapshot offline cũ (helper_id null)
//    và React Query coi đó là dữ liệu mới.
// Trong khi đó báo giá ĐÃ ĐƯỢC CHỌN của chính thợ (GET /jobs/:id/quotes,
// poll mỗi 15s) là bằng chứng thứ hai, độc lập, cho thấy khách đã giao đơn.
// Vì vậy cổng này chấp nhận cả hai nguồn, với điều kiện chặt để không nhận
// nhầm: báo giá accepted chỉ được dùng khi job.helper_id còn null (snapshot
// cũ trước lúc giao đơn). Sau SOS rematch, helper_id là thợ mới (khác null)
// nên thợ cũ không bị nhận nhầm dù báo giá cũ của họ vẫn còn 'accepted'.
//
// Hàm thuần (không import React Native) để có thể kiểm chứng bằng node/tsc
// — apps/mobile chưa có jest harness.

export type HelperIdLike = string | { _id?: unknown } | null | undefined;

export interface JobAssignmentLike {
  helper_id?: HelperIdLike;
  status?: string | null;
}

export interface QuoteAssignmentLike {
  helper_id?: HelperIdLike;
  status?: string | null;
}

/** Chuẩn hoá helper_id dạng string | object populate {_id} | ObjectId về string. */
export function resolveHelperId(value: HelperIdLike): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value || null;
  const id = (value as { _id?: unknown })?._id;
  if (typeof id === 'string') return id || null;
  if (id != null && typeof (id as { toString?: unknown }).toString === 'function') {
    const s = String(id);
    return s || null;
  }
  return null;
}

const INACTIVE_STATUSES = new Set(['cancelled', 'completed', 'refunded']);

/** Thợ hiện tại có phải thợ được giao đơn này không (theo job.helper_id). */
export function isAssignedToMe(
  job: JobAssignmentLike | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (!job || !currentUserId) return false;
  const helperId = resolveHelperId(job.helper_id);
  return Boolean(helperId && helperId === String(currentUserId));
}

/**
 * Báo giá ĐÃ ĐƯỢC CHỌN của chính thợ — bằng chứng dự phòng khi job.helper_id
 * còn null (payload cũ). Chỉ dùng khi helper_id null nên không nhận nhầm đơn
 * đã rematch cho thợ khác (lúc đó helper_id là thợ mới, khác null).
 */
export function hasMyAcceptedQuote(
  quotes: QuoteAssignmentLike[] | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (!Array.isArray(quotes) || !currentUserId) return false;
  return quotes.some(
    q => q?.status === 'accepted' && resolveHelperId(q.helper_id) === String(currentUserId),
  );
}

/**
 * Đơn đang làm của tôi: được giao (job.helper_id khớp, hoặc báo giá accepted
 * của tôi trong khi helper_id còn null) và chưa kết thúc/huỷ/hoàn tiền.
 * Cổng này điều khiển cả 3 thẻ: thông tin khách, hợp đồng và cập nhật tiến độ.
 */
export function isMyActiveJob(
  job: JobAssignmentLike | null | undefined,
  currentUserId: string | null | undefined,
  quotes?: QuoteAssignmentLike[] | null,
): boolean {
  if (!job || !currentUserId) return false;
  const assigned =
    isAssignedToMe(job, currentUserId) ||
    (resolveHelperId(job.helper_id) == null && hasMyAcceptedQuote(quotes, currentUserId));
  return assigned && !INACTIVE_STATUSES.has(String(job.status ?? ''));
}

/**
 * Trạng thái hiệu lực cho thẻ tiến độ: khi cổng dự phòng (báo giá accepted)
 * chứng minh đơn đã được giao nhưng payload job còn cũ (status open /
 * receiving_quotes, helper_id null) thì coi như 'confirmed' để nút
 * "Bắt đầu di chuyển đến khách" hiện đúng. Server vẫn là chốt chặn cuối
 * (on-the-way kiểm tra helper_id thật, sai thì 403), nên không thể bấm nhầm
 * đơn của người khác. Mọi chỗ khác trong màn hình vẫn dùng job.status thật;
 * lần poll useJobDetail (15s) sẽ sửa payload về đúng ngay sau đó.
 */
export function effectiveJobStatus(
  job: JobAssignmentLike | null | undefined,
  currentUserId: string | null | undefined,
  quotes?: QuoteAssignmentLike[] | null,
): string {
  const status = String(job?.status ?? '');
  if (
    !isAssignedToMe(job, currentUserId) &&
    resolveHelperId(job?.helper_id) == null &&
    hasMyAcceptedQuote(quotes, currentUserId) &&
    (status === 'open' || status === 'receiving_quotes')
  ) {
    return 'confirmed';
  }
  return status;
}

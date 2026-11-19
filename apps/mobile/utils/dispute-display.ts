// utils/dispute-display.ts — R14-L2: Cổng hiển thị hộp đỏ "Đơn đang có tranh chấp".
//
// Tranh chấp chỉ được coi là còn mở khi đơn đang ở trạng thái 'disputed',
// chưa có phán quyết (dispute_resolution chưa có), và đơn chưa kết thúc
// (không phải completed hay cancelled).
// Khi dispute đã xử lý xong (reject/resolve) hoặc đơn đã hoàn thành thì ẩn hộp đỏ.

export interface DisputeJobLike {
  status?: string | null;
  dispute_resolution?: unknown;
}

export function shouldShowOpenDisputeBanner(job: DisputeJobLike | null | undefined): boolean {
  if (!job) return false;
  if (job.status !== 'disputed') return false;
  if (['completed', 'cancelled'].includes(job.status)) return false;
  if (job.dispute_resolution != null) return false;
  return true;
}

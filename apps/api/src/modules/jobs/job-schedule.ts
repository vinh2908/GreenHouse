/**
 * R7: các helper lịch làm việc (giờ Việt Nam) dùng chung cho JobsService và
 * module phát hiện đơn có nguy cơ kẹt (at-risk.ts). Tách riêng để at-risk
 * không phải import từ jobs.service.ts (tránh import vòng).
 *
 * Quy ước: ngày làm việc lưu ở preferred_date, giờ bắt đầu ở
 * preferred_time_start ('HH:mm'). Mốc bắt đầu = ngày VN + giờ + múi +07:00.
 */

/** P2-4 & H27(a): Chuỗi ngày 'YYYY-MM-DD' theo giờ Việt Nam (+07:00), tránh lệch ngày UTC khi dùng Date object. */
export function toVnDateString(dateInput: unknown): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = new Date(dateInput as any);
  if (isNaN(d.getTime())) return '';
  const vnTime = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.toISOString().slice(0, 10);
}

const HH_MM_RE = /^(\d{1,2}):(\d{2})/;

/**
 * R7 item 2 — "quá giờ hẹn thì ẩn hết bên thợ" (Vinh, decided 2026-11-14):
 * mốc bắt đầu theo giờ VN từ preferred_date + preferred_time_start.
 * Trả null khi không có ngày/giờ dùng được (đơn linh hoạt — không bao giờ
 * tính là quá giờ).
 */
export function jobScheduledStart(job: {
  preferred_date?: unknown;
  preferred_time_start?: string | null;
}): Date | null {
  const dateStr = toVnDateString(job.preferred_date);
  const timeStr = (job.preferred_time_start ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{1,2}:\d{2}$/.test(timeStr)) {
    return null;
  }
  const [h, m] = timeStr.split(':').map(Number);
  const start = new Date(
    `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`,
  );
  return Number.isNaN(start.getTime()) ? null : start;
}

export { HH_MM_RE };

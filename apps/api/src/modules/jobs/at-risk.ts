/**
 * R7 watchdog (iii)/(iv): phát hiện đơn "có nguy cơ kẹt" — DETECT + NOTIFY
 * + hiện trong admin, KHÔNG tự sửa (không hủy/hoàn tiền — cần quyết của Vinh).
 *
 * - (iii) helper_no_start: đơn đã có thợ (CONFIRMED / ON_THE_WAY / ARRIVED)
 *   nhưng quá giờ hẹn 1 giờ mà thợ vẫn chưa bắt đầu (chưa sang IN_PROGRESS).
 *   Ngưỡng 1 giờ là ĐỀ XUẤT, chưa được Vinh quyết — chỉ dùng để phát hiện +
 *   nhắc, không dùng để hủy hay gán lại.
 * - (iv) review_waiting_3d / review_waiting_7d: đơn PENDING_REVIEW mà khách
 *   không nghiệm thu sau 3 ngày (nhắc khách) / 7 ngày (leo thang tới admin).
 *   Mốc tính từ lần chuyển sang PENDING_REVIEW gần nhất (events), fallback
 *   updated_at khi không có event.
 *
 * Các cờ được lưu lên job (at_risk_flags + at_risk_detected_at) để admin
 * lọc/xem; sweep chỉ thông báo khi cờ MỚI xuất hiện (so với cờ đã lưu).
 */
import { JobStatus } from '@homemate/types';
import { jobScheduledStart } from './job-schedule';

export const AT_RISK_HELPER_NO_START = 'helper_no_start';
export const AT_RISK_REVIEW_WAITING_3D = 'review_waiting_3d';
export const AT_RISK_REVIEW_WAITING_7D = 'review_waiting_7d';

/** Đề xuất (chưa quyết): thợ chưa bắt đầu sau 1 giờ kể từ giờ hẹn. */
export const HELPER_NO_START_AFTER_MS = 60 * 60 * 1000;
/** Đề xuất (chưa quyết): nhắc khách nghiệm thu sau 3 ngày. */
export const REVIEW_WAITING_3D_MS = 3 * 24 * 60 * 60 * 1000;
/** Đề xuất (chưa quyết): leo thang tới admin sau 7 ngày. */
export const REVIEW_WAITING_7D_MS = 7 * 24 * 60 * 60 * 1000;

export interface AtRiskJobLike {
  status: string;
  helper_id?: unknown;
  preferred_date?: unknown;
  preferred_time_start?: string | null;
  events?: Array<{ status?: string; timestamp?: Date | string }>;
  updated_at?: Date | string;
  updatedAt?: Date | string;
}

const ACCEPTED_NOT_STARTED: JobStatus[] = [
  JobStatus.CONFIRMED,
  JobStatus.HELPER_ON_THE_WAY,
  JobStatus.HELPER_ARRIVED,
];

/** Mốc PENDING_REVIEW gần nhất (event) hoặc updated_at khi không có event. */
export function reviewSinceMs(job: AtRiskJobLike): number | null {
  let since: number | null = null;
  for (const e of job.events ?? []) {
    if (e?.status === JobStatus.PENDING_REVIEW && e.timestamp) {
      const t = new Date(e.timestamp).getTime();
      if (!Number.isNaN(t) && (since == null || t > since)) since = t;
    }
  }
  if (since != null) return since;
  const fallback = job.updated_at ?? job.updatedAt;
  if (!fallback) return null;
  const t = new Date(fallback).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Pure: các cờ at-risk hiện tại của đơn (không chạm DB, không gửi gì). */
export function detectAtRiskFlags(job: AtRiskJobLike, nowMs: number = Date.now()): string[] {
  const flags: string[] = [];

  if (
    ACCEPTED_NOT_STARTED.includes(job.status as JobStatus) &&
    job.helper_id != null &&
    job.helper_id !== ''
  ) {
    const startMs = jobScheduledStart(job)?.getTime() ?? null;
    if (startMs != null && nowMs >= startMs + HELPER_NO_START_AFTER_MS) {
      flags.push(AT_RISK_HELPER_NO_START);
    }
  }

  if (job.status === JobStatus.PENDING_REVIEW) {
    const since = reviewSinceMs(job);
    if (since != null) {
      if (nowMs >= since + REVIEW_WAITING_7D_MS) {
        flags.push(AT_RISK_REVIEW_WAITING_3D, AT_RISK_REVIEW_WAITING_7D);
      } else if (nowMs >= since + REVIEW_WAITING_3D_MS) {
        flags.push(AT_RISK_REVIEW_WAITING_3D);
      }
    }
  }

  return flags;
}

/**
 * Điểm hiệu suất thợ — thang 100 theo 4 tiêu chí (mở rộng từ các field sẵn có
 * trên HelperProfile, KHÔNG tạo hệ điểm song song):
 *
 *   Đánh giá dịch vụ (rating)        tối đa 40đ  = rating/5 × 40
 *                                                (chưa có review nào → 40đ, như mặc định trung tính)
 *   Hoàn thành đơn (completion_rate) tối đa 25đ  = completion_rate/100 × 25
 *   Phản hồi (acceptance_rate)       tối đa 15đ  = acceptance_rate/100 × 15
 *   Độ tin cậy (reliability)         tối đa 20đ  = 20 − điểm phạt hủy đơn (sàn 0)
 *
 * QUY TẮC PHẠT HỦY ĐƠN (chủ dự án đặt): trong cửa sổ trượt 7 NGÀY, thợ tự hủy
 * (hủy đơn thường SAU khi đã chốt + gửi SOS Backup) quá 3 lần thì bị trừ điểm
 * ở tiêu chí Độ tin cậy: từ lần hủy vượt ngưỡng trở đi, mỗi lần −5đ.
 * Tất cả con số đều là HẰNG SỐ CÓ THỂ CHỈNH bằng env (mặc định do đội dự án chọn):
 *   HELPER_SCORE_CANCEL_WINDOW_DAYS   (mặc định 7)
 *   HELPER_SCORE_CANCEL_THRESHOLD     (mặc định 3 — hủy ≤ 3 lần/7 ngày: không phạt)
 *   HELPER_SCORE_PENALTY_PER_EXCESS   (mặc định 5 điểm/lần vượt)
 */

export interface HelperScoreConfig {
  windowDays: number;
  threshold: number;
  pointsPerExcess: number;
  weights: { rating: number; completion: number; responsiveness: number; reliability: number };
}

export const DEFAULT_HELPER_SCORE_CONFIG: HelperScoreConfig = {
  windowDays: 7,
  threshold: 3,
  pointsPerExcess: 5,
  weights: { rating: 40, completion: 25, responsiveness: 15, reliability: 20 },
};

/** Đọc cấu hình từ env (getter để hàm vẫn thuần & test được) */
export function helperScoreConfigFromEnv(
  get: (key: string) => string | undefined,
): HelperScoreConfig {
  const num = (key: string, def: number) => {
    const n = Number(get(key));
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    ...DEFAULT_HELPER_SCORE_CONFIG,
    windowDays: num('HELPER_SCORE_CANCEL_WINDOW_DAYS', DEFAULT_HELPER_SCORE_CONFIG.windowDays),
    threshold: Math.floor(
      num('HELPER_SCORE_CANCEL_THRESHOLD', DEFAULT_HELPER_SCORE_CONFIG.threshold),
    ),
    pointsPerExcess: num(
      'HELPER_SCORE_PENALTY_PER_EXCESS',
      DEFAULT_HELPER_SCORE_CONFIG.pointsPerExcess,
    ),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Đếm số lần hủy trong cửa sổ trượt [now − windowDays, now] */
export function countCancellationsInWindow(
  timestamps: readonly (Date | string | number)[],
  now: Date,
  windowDays: number,
): number {
  const from = now.getTime() - windowDays * DAY_MS;
  let count = 0;
  for (const t of timestamps) {
    const ms = new Date(t).getTime();
    if (Number.isFinite(ms) && ms >= from && ms <= now.getTime()) count++;
  }
  return count;
}

/** Cắt bỏ các mốc hủy đã ra khỏi cửa sổ (giữ danh sách trên hồ sơ luôn gọn) */
export function pruneCancellationTimestamps<T extends Date | string | number>(
  timestamps: readonly T[],
  now: Date,
  windowDays: number,
): T[] {
  const from = now.getTime() - windowDays * DAY_MS;
  return timestamps.filter(t => {
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) && ms >= from;
  });
}

/** Số lần hủy VƯỢT ngưỡng trong cửa sổ (≤ ngưỡng → 0) */
export function excessCancellations(
  countInWindow: number,
  config: HelperScoreConfig = DEFAULT_HELPER_SCORE_CONFIG,
): number {
  return Math.max(0, countInWindow - config.threshold);
}

/** Tổng điểm phạt trừ vào tiêu chí Độ tin cậy */
export function cancellationPenaltyPoints(
  countInWindow: number,
  config: HelperScoreConfig = DEFAULT_HELPER_SCORE_CONFIG,
): number {
  return excessCancellations(countInWindow, config) * config.pointsPerExcess;
}

export type ScoreWarningLevel = 'none' | 'approaching' | 'penalized';

/**
 * Mức cảnh báo cho thợ:
 *  - penalized: đã vượt ngưỡng, đang bị trừ điểm
 *  - approaching: còn cách ngưỡng ≤ 1 lần hủy (count ≥ threshold − 1)
 */
export function scoreWarningLevel(
  countInWindow: number,
  config: HelperScoreConfig = DEFAULT_HELPER_SCORE_CONFIG,
): ScoreWarningLevel {
  if (countInWindow > config.threshold) return 'penalized';
  if (countInWindow >= config.threshold - 1) return 'approaching';
  return 'none';
}

export interface HelperScoreInput {
  rating?: number | null;
  totalReviews?: number | null;
  completionRate?: number | null;
  acceptanceRate?: number | null;
  cancellationsInWindow: number;
}

export interface HelperScoreBreakdown {
  rating: number;
  completion: number;
  responsiveness: number;
  reliability: number;
}

export interface HelperScoreResult {
  total: number;
  breakdown: HelperScoreBreakdown;
  penaltyPoints: number;
  cancellationsInWindow: number;
  warningLevel: ScoreWarningLevel;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Tính điểm hiệu suất 100 từ các chỉ số sẵn có + số hủy trong cửa sổ */
export function computePerformanceScore(
  input: HelperScoreInput,
  config: HelperScoreConfig = DEFAULT_HELPER_SCORE_CONFIG,
): HelperScoreResult {
  const { weights } = config;
  const penaltyPoints = cancellationPenaltyPoints(input.cancellationsInWindow, config);

  const ratingPoints =
    (input.totalReviews ?? 0) > 0
      ? (clamp(input.rating ?? 0, 0, 5) / 5) * weights.rating
      : weights.rating; // chưa có review → trung tính như các rate mặc định 100 của hồ sơ
  const completionPoints = (clamp(input.completionRate ?? 100, 0, 100) / 100) * weights.completion;
  const responsivenessPoints =
    (clamp(input.acceptanceRate ?? 100, 0, 100) / 100) * weights.responsiveness;
  const reliabilityPoints = Math.max(0, weights.reliability - penaltyPoints);

  const breakdown: HelperScoreBreakdown = {
    rating: round1(ratingPoints),
    completion: round1(completionPoints),
    responsiveness: round1(responsivenessPoints),
    reliability: round1(reliabilityPoints),
  };
  const total = round1(
    clamp(
      breakdown.rating + breakdown.completion + breakdown.responsiveness + breakdown.reliability,
      0,
      100,
    ),
  );

  return {
    total,
    breakdown,
    penaltyPoints,
    cancellationsInWindow: input.cancellationsInWindow,
    warningLevel: scoreWarningLevel(input.cancellationsInWindow, config),
  };
}

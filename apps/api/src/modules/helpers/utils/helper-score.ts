import { VerificationStatus } from '@homemate/types';

/**
 * Điểm thợ — MỘT công thức duy nhất (B87/G8, quyết định của chủ 2026-11-07):
 *
 *   Khoảng cách (Distance)  tối đa 40đ  = (1 − km/20) × 40
 *                                        (0km → 40đ, ≥20km → 0đ; thiếu tọa độ tham chiếu → 0đ)
 *   Kỹ năng (Skill)         tối đa 30đ  = đúng chuyên môn → 30đ, không → 0.4 × 30 = 12đ
 *   Đánh giá (Rating)       tối đa 20đ  = rating/5 × 20 (chưa có rating → 0đ)
 *   Xác minh e-KYC (KYC)    tối đa 10đ  = đã duyệt → 10đ, chưa → 0đ
 *   Trừ phạt hủy đơn (quy tắc riêng, giữ nguyên — SOS Backup): trong cửa sổ
 *   trượt 7 NGÀY, thợ tự hủy quá 3 lần thì mỗi lần vượt −5đ vào TỔNG (sàn 0).
 *
 * Cả gợi ý thợ (matching — có đơn tham chiếu để đo khoảng cách + đối chiếu
 * dịch vụ) và xếp hạng admin (không có đơn tham chiếu — khoảng cách = −1,
 * kỹ năng = thợ có đăng ký dịch vụ nào không) đều gọi cùng hàm
 * computeHelperScore với cùng 1 input shape; cùng input → cùng 1 số.
 * Trước đây có 2 công thức song song (computeJobFitScore 40/30/20/10 và
 * computePerformanceScore 40/25/15/20) nên cùng 1 thợ cho 2 số khác nhau —
 * cả 2 đã bị xoá, chỉ còn hàm chung này.
 *
 * QUY TẮC PHẠT HỦY ĐƠN (chủ dự án đặt): trong cửa sổ trượt 7 NGÀY, thợ tự hủy
 * (hủy đơn thường SAU khi đã chốt + gửi SOS Backup) quá 3 lần thì bị trừ điểm:
 * từ lần hủy vượt ngưỡng trở đi, mỗi lần −5đ.
 * Tất cả con số đều là HẰNG SỐ CÓ THỂ CHỈNH bằng env (mặc định do đội dự án chọn):
 *   HELPER_SCORE_CANCEL_WINDOW_DAYS   (mặc định 7)
 *   HELPER_SCORE_CANCEL_THRESHOLD     (mặc định 3 — hủy ≤ 3 lần/7 ngày: không phạt)
 *   HELPER_SCORE_PENALTY_PER_EXCESS   (mặc định 5 điểm/lần vượt)
 * Trọng số 40/30/20/10 do chủ chốt, KHÔNG chỉnh bằng env.
 */

export interface HelperScoreConfig {
  windowDays: number;
  threshold: number;
  pointsPerExcess: number;
}

export const DEFAULT_HELPER_SCORE_CONFIG: HelperScoreConfig = {
  windowDays: 7,
  threshold: 3,
  pointsPerExcess: 5,
};

/** Trọng số duy nhất của điểm thợ (chủ chốt 2026-11-07): Distance 40 / Skill 30 / Rating 20 / KYC 10 */
export const HELPER_SCORE_WEIGHTS = { distance: 40, skill: 30, rating: 20, kyc: 10 } as const;

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

/** Tổng điểm phạt trừ vào TỔNG điểm thợ */
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

/** Chuẩn hoá rating 0–5 về 0–1 — dùng chung cho mọi đường tính điểm. */
export function normalizeRating(rating?: number | null): number {
  return clamp(rating ?? 0, 0, 5) / 5;
}

/** Input duy nhất của công thức điểm thợ — cả gợi ý (matching) và xếp hạng admin đều dựng input này. */
export interface HelperScoreInput {
  distanceKm: number; // -1 = thiếu tọa độ tham chiếu (không cộng điểm khoảng cách)
  hasService: boolean; // đúng chuyên môn của đơn / đã đăng ký dịch vụ (đường admin)
  rating?: number | null;
  isVerified: boolean;
  cancellationsInWindow: number;
}

export interface HelperScoreBreakdown {
  distance: number;
  skill: number;
  rating: number;
  kyc: number;
}

export interface HelperScoreResult {
  total: number;
  breakdown: HelperScoreBreakdown;
  penaltyPoints: number;
  cancellationsInWindow: number;
  warningLevel: ScoreWarningLevel;
  reasons: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * CÔNG THỨC ĐIỂM THỢ DUY NHẤT (thang 100):
 * tổng = Distance 40 + Skill 30 + Rating 20 + KYC 10 − phạt hủy đơn (sàn 0).
 */
export function computeHelperScore(
  input: HelperScoreInput,
  config: HelperScoreConfig = DEFAULT_HELPER_SCORE_CONFIG,
): HelperScoreResult {
  const penaltyPoints = cancellationPenaltyPoints(input.cancellationsInWindow, config);
  const reasons: string[] = [];

  const hasCoords = input.distanceKm >= 0;
  // Chuẩn hoá khoảng cách về 0–1 (0km → 1.0, 20km → 0.0)
  const normDistance = hasCoords ? Math.max(0, 1 - input.distanceKm / 20) : 0;
  if (!hasCoords) reasons.push('Chưa có vị trí');
  else if (input.distanceKm <= 3) reasons.push(`Khoảng cách rất gần (${input.distanceKm}km)`);
  else reasons.push(`Cách ${input.distanceKm}km`);

  const normSkill = input.hasService ? 1.0 : 0.4;
  if (input.hasService) reasons.push('Đúng chuyên môn yêu cầu');

  const normRating = normalizeRating(input.rating);
  if ((input.rating ?? 0) >= 4.8) reasons.push(`Uy tín cao: ★ ${(input.rating ?? 0).toFixed(1)}`);

  const normKyc = input.isVerified ? 1.0 : 0.0;
  if (input.isVerified) reasons.push('Đã xác minh e-KYC');

  const breakdown: HelperScoreBreakdown = {
    distance: round1(normDistance * HELPER_SCORE_WEIGHTS.distance),
    skill: round1(normSkill * HELPER_SCORE_WEIGHTS.skill),
    rating: round1(normRating * HELPER_SCORE_WEIGHTS.rating),
    kyc: round1(normKyc * HELPER_SCORE_WEIGHTS.kyc),
  };
  const base = breakdown.distance + breakdown.skill + breakdown.rating + breakdown.kyc;
  const total = round1(clamp(base - penaltyPoints, 0, 100));

  return {
    total,
    breakdown,
    penaltyPoints,
    cancellationsInWindow: input.cancellationsInWindow,
    warningLevel: scoreWarningLevel(input.cancellationsInWindow, config),
    reasons,
  };
}

export interface HelperProfileScoreSource {
  rating?: number | null;
  verification_status?: string | null;
  service_ids?: readonly unknown[] | null;
}

/**
 * Dựng input cho hàm chung từ hồ sơ thợ (đường admin / xếp hạng — KHÔNG có
 * đơn tham chiếu): khoảng cách không đo được → −1 (0đ, cùng quy tắc như
 * matching khi thiếu tọa độ); kỹ năng = thợ có đăng ký dịch vụ nào không
 * (có → đủ 30đ, không → 12đ như trường hợp không đúng chuyên môn ở matching).
 */
export function helperScoreInputFromProfile(
  profile: HelperProfileScoreSource,
  cancellationsInWindow: number,
): HelperScoreInput {
  return {
    distanceKm: -1,
    hasService: (profile.service_ids?.length ?? 0) > 0,
    rating: profile.rating ?? null,
    isVerified: profile.verification_status === VerificationStatus.APPROVED,
    cancellationsInWindow,
  };
}

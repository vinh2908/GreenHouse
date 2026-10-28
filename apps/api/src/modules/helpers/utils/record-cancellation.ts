import { Model, Types } from 'mongoose';
import { HelperProfileDocument } from '../schemas/helper-profile.schema';
import { HelperPenaltyEventDocument } from '../schemas/helper-penalty-event.schema';
import {
  HelperScoreConfig,
  HelperScoreResult,
  cancellationPenaltyPoints,
  computePerformanceScore,
  helperScoreConfigFromEnv,
  pruneCancellationTimestamps,
} from './helper-score';

export interface CancellationScoreSummary extends HelperScoreResult {
  /** Lần hủy này có phải là lần đầu bị trừ điểm (vừa vượt ngưỡng) hay bị trừ thêm không */
  just_penalized: boolean;
  /** Số điểm bị trừ bởi chính lần hủy này (0 nếu còn trong ngưỡng) */
  points_deducted_now: number;
}

/**
 * Ghi nhận 1 lần hủy DO THỢ KHỞI XƯỚNG (hủy đơn thường sau khi chốt, hoặc gửi
 * SOS Backup) rồi tính lại điểm hiệu suất:
 *  1. Cắt các mốc hủy ngoài cửa sổ trượt, thêm mốc mới vào HelperProfile.
 *  2. Tính lại penalty + performance_score (snapshot) trên hồ sơ.
 *  3. Nếu lần hủy này làm phát sinh điểm trừ → ghi HelperPenaltyEvent (audit admin).
 * Trả về tóm tắt điểm để nơi gọi hiển thị cảnh báo cho thợ; null nếu thợ chưa có hồ sơ.
 * Hàm này KHÔNG ném lỗi ra ngoài ý muốn — nơi gọi vẫn nên bọc try/catch để việc
 * ghi điểm không bao giờ chặn luồng hủy đơn/SOS chính.
 */
export async function recordHelperCancellation(args: {
  helperModel: Model<HelperProfileDocument>;
  penaltyEventModel?: Model<HelperPenaltyEventDocument>;
  helperId: string;
  source: 'job_cancel' | 'sos_initiation';
  jobId: string;
  sosId?: string;
  config?: HelperScoreConfig;
  envGet?: (key: string) => string | undefined;
  now?: Date;
}): Promise<CancellationScoreSummary | null> {
  const now = args.now ?? new Date();
  const config = args.config ?? helperScoreConfigFromEnv(args.envGet ?? (key => process.env[key]));

  const profile = await args.helperModel
    .findOne({ user_id: new Types.ObjectId(args.helperId) })
    .exec();
  if (!profile) return null;

  // A7: Thợ kích hoạt SOS hợp lệ không bị tính vào cửa sổ phạt hủy thường ("thợ không bị phạt")
  if (args.source === 'sos_initiation') {
    const pruned = pruneCancellationTimestamps(
      profile.cancellation_timestamps ?? [],
      now,
      config.windowDays,
    );
    const result = computePerformanceScore(
      {
        rating: profile.rating,
        totalReviews: profile.total_reviews,
        completionRate: profile.completion_rate,
        acceptanceRate: profile.acceptance_rate,
        cancellationsInWindow: pruned.length,
      },
      config,
    );
    profile.cancellation_timestamps = pruned;
    profile.cancellations_last_7_days = pruned.length;
    profile.penalty_points = result.penaltyPoints;
    profile.performance_score = result.total;
    profile.score_breakdown = result.breakdown;
    profile.score_updated_at = now;
    await profile.save();

    return {
      ...result,
      just_penalized: false,
      points_deducted_now: 0,
    };
  }

  const pruned = pruneCancellationTimestamps(
    profile.cancellation_timestamps ?? [],
    now,
    config.windowDays,
  );
  const penaltyBefore = cancellationPenaltyPoints(pruned.length, config);
  const timestamps = [...pruned, now];
  const result = computePerformanceScore(
    {
      rating: profile.rating,
      totalReviews: profile.total_reviews,
      completionRate: profile.completion_rate,
      acceptanceRate: profile.acceptance_rate,
      cancellationsInWindow: timestamps.length,
    },
    config,
  );
  const pointsDeductedNow = Math.max(0, result.penaltyPoints - penaltyBefore);

  profile.cancellation_timestamps = timestamps;
  profile.cancellations_last_7_days = timestamps.length;
  profile.penalty_points = result.penaltyPoints;
  profile.performance_score = result.total;
  profile.score_breakdown = result.breakdown;
  profile.score_updated_at = now;
  await profile.save();

  if (pointsDeductedNow > 0 && args.penaltyEventModel) {
    await args.penaltyEventModel.create({
      helper_id: new Types.ObjectId(args.helperId),
      source: args.source,
      job_id: new Types.ObjectId(args.jobId),
      sos_id: args.sosId ? new Types.ObjectId(args.sosId) : undefined,
      cancellations_in_window: timestamps.length,
      excess_count: timestamps.length - config.threshold,
      points_deducted: pointsDeductedNow,
      performance_score_after: result.total,
    });
  }

  return {
    ...result,
    just_penalized: pointsDeductedNow > 0,
    points_deducted_now: pointsDeductedNow,
  };
}

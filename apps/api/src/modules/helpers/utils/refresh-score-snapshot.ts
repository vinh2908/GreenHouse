import { Model, Types } from 'mongoose';
import { HelperProfileDocument } from '../schemas/helper-profile.schema';
import {
  HelperScoreConfig,
  computeHelperScore,
  countCancellationsInWindow,
  helperScoreConfigFromEnv,
  helperScoreInputFromProfile,
  pruneCancellationTimestamps,
} from './helper-score';

/**
 * R13-N2-I2 — lazy-refresh the stored score snapshot on read.
 *
 * The snapshot (performance_score / score_breakdown / penalty_points /
 * cancellations_last_7_days) is written only on cancel/SOS, review and
 * waive — so it goes STALE when nothing "happens" to the helper: e-KYC
 * approval (+10), service registration change (+18 skill), or penalty
 * timestamps aging out of the 7-day window (penalty drops). Both read
 * paths (admin getUserDetail, helper GET /helpers/me/profile, public
 * profile) return the stored snapshot, so admin and helper both saw the
 * stale number. Live ranking (matching / Hungarian) never had this bug —
 * it recomputes from the timestamp list every time.
 *
 * Fix: recompute from the live profile + timestamp list on every read and
 * persist ONLY when something actually changed (usually no write at all).
 * The read then always shows the true score, and the snapshot self-heals
 * without a sweep or a trigger in every writer. Callers must wrap in
 * try/catch — scoring must never block the main read flow (same contract
 * as recordHelperCancellation / removeCancellationTimestamp).
 */
export async function refreshHelperScoreSnapshot(args: {
  helperModel: Model<HelperProfileDocument>;
  helperId: string;
  config?: HelperScoreConfig;
  envGet?: (key: string) => string | undefined;
  now?: Date;
}): Promise<HelperProfileDocument | null> {
  const now = args.now ?? new Date();
  const config = args.config ?? helperScoreConfigFromEnv(args.envGet ?? (key => process.env[key]));

  const profile = await args.helperModel
    .findOne({ user_id: new Types.ObjectId(args.helperId) })
    .exec();
  if (!profile) return null;

  const pruned = pruneCancellationTimestamps(
    profile.cancellation_timestamps ?? [],
    now,
    config.windowDays,
  );
  const count = countCancellationsInWindow(pruned, now, config.windowDays);
  const result = computeHelperScore(helperScoreInputFromProfile(profile, count), config);

  const breakdown = profile.score_breakdown as
    { distance: number; skill: number; rating: number; kyc: number } | null | undefined;
  const breakdownChanged =
    !breakdown ||
    breakdown.distance !== result.breakdown.distance ||
    breakdown.skill !== result.breakdown.skill ||
    breakdown.rating !== result.breakdown.rating ||
    breakdown.kyc !== result.breakdown.kyc;

  if (
    profile.performance_score !== result.total ||
    profile.penalty_points !== result.penaltyPoints ||
    profile.cancellations_last_7_days !== count ||
    breakdownChanged ||
    (profile.cancellation_timestamps?.length ?? 0) !== pruned.length
  ) {
    profile.cancellation_timestamps = pruned;
    profile.cancellations_last_7_days = count;
    profile.penalty_points = result.penaltyPoints;
    profile.performance_score = result.total;
    profile.score_breakdown = result.breakdown;
    profile.score_updated_at = now;
    await profile.save();
  }

  return profile;
}

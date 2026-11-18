import { Model, Types } from 'mongoose';
import { HelperProfileDocument } from '../schemas/helper-profile.schema';
import { HelperPenaltyEventDocument } from '../schemas/helper-penalty-event.schema';
import {
  HelperScoreConfig,
  HelperScoreResult,
  computeHelperScore,
  countCancellationsInWindow,
  helperScoreConfigFromEnv,
  helperScoreInputFromProfile,
  pruneCancellationTimestamps,
} from './helper-score';

/**
 * R13-N4 — negate one recorded cancellation (mirror image of
 * recordHelperCancellation). Used when a helper WITHDRAWS an SOS: the
 * initiation timestamp that createSos counted as a cancel must not stand,
 * and an active penalty event written for that SOS must be waived (audit
 * preserved — the original numbers stay on the event, only its status
 * flips to 'waived').
 *
 * Why removal (not just waiving the event): an SOS within the threshold
 * writes no event, but its timestamp still counts toward a future 4th
 * cancel; waiving the event alone would leave that. Removing the stamp
 * nearest the SOS creation (≤ 5 min — the initiation stamp was written
 * within seconds of the SOS) fixes both the snapshot and the live
 * recompute readers (matching / Hungarian), which read the same list.
 *
 * The admin waive path (recomputeScoreAfterWaive) reuses this function so
 * the two negations can never drift apart. Callers must wrap in try/catch
 * — scoring must never block the main flow (same contract as
 * recordHelperCancellation).
 */
export async function removeCancellationTimestamp(args: {
  helperModel: Model<HelperProfileDocument>;
  penaltyEventModel?: Model<HelperPenaltyEventDocument>;
  helperId: string;
  /** Reference time: the stamp nearest to this (≤ 5 min) is removed. Absent → only prune + recompute. */
  near?: Date | string | null;
  sosId?: string;
  waiveReason?: string;
  config?: HelperScoreConfig;
  envGet?: (key: string) => string | undefined;
  now?: Date;
}): Promise<HelperScoreResult | null> {
  const now = args.now ?? new Date();
  const config = args.config ?? helperScoreConfigFromEnv(args.envGet ?? (key => process.env[key]));

  const profile = await args.helperModel
    .findOne({ user_id: new Types.ObjectId(args.helperId) })
    .exec();
  if (!profile) return null;

  const stamps = [...(profile.cancellation_timestamps ?? [])];
  if (args.near) {
    const nearMs = new Date(args.near).getTime();
    let removeIdx = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    stamps.forEach((t, i) => {
      const delta = Math.abs(new Date(t).getTime() - nearMs);
      if (delta < bestDelta) {
        bestDelta = delta;
        removeIdx = i;
      }
    });
    if (removeIdx >= 0 && bestDelta <= 5 * 60 * 1000) stamps.splice(removeIdx, 1);
  }

  const pruned = pruneCancellationTimestamps(stamps, now, config.windowDays);
  const count = countCancellationsInWindow(pruned, now, config.windowDays);
  const result = computeHelperScore(helperScoreInputFromProfile(profile, count), config);

  profile.cancellation_timestamps = pruned;
  profile.cancellations_last_7_days = count;
  profile.penalty_points = result.penaltyPoints;
  profile.performance_score = result.total;
  profile.score_breakdown = result.breakdown;
  profile.score_updated_at = now;
  await profile.save();

  if (args.sosId && args.penaltyEventModel) {
    await args.penaltyEventModel
      .findOneAndUpdate(
        { sos_id: new Types.ObjectId(args.sosId), status: { $ne: 'waived' } },
        {
          $set: {
            status: 'waived',
            waived_at: now,
            waive_reason:
              args.waiveReason ??
              'SOS withdrawn by helper — withdrawn SOS must not count as cancellation (R13-N4)',
          },
        },
        { new: true },
      )
      .exec()
      .catch(() => undefined);
  }

  return result;
}

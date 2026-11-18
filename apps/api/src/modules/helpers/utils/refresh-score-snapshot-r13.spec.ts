import { Types } from 'mongoose';
import { refreshHelperScoreSnapshot } from './refresh-score-snapshot';

/**
 * R13-N2-I2 — stored score snapshot goes stale on read.
 *
 * The snapshot (performance_score / score_breakdown / penalty_points /
 * cancellations_last_7_days) is written only on cancel/SOS, review and
 * waive — so it stays wrong after e-KYC approval (+10 KYC), after a
 * service registration change (+18 skill), and while penalty timestamps
 * age out of the 7-day window. Both read paths return the stored
 * snapshot, so admin and helper both saw the stale number.
 *
 * FAILS on base d06aa9c: no refresh happens on read (score stays 12/37).
 */
describe('refreshHelperScoreSnapshot — R13-N2-I2 lazy refresh on read', () => {
  function makeProfile(over: Record<string, unknown> = {}): any {
    const base: Record<string, unknown> = {
      user_id: new Types.ObjectId(),
      service_ids: [],
      rating: null,
      verification_status: 'unsubmitted',
      cancellation_timestamps: [],
      cancellations_last_7_days: 0,
      penalty_points: 0,
      performance_score: 12,
      score_breakdown: { distance: 0, skill: 12, rating: 0, kyc: 0 },
      score_updated_at: new Date(),
      save: jest.fn(async () => true),
    };
    return { ...base, ...over };
  }

  function makeHelperModel(profile: any) {
    return {
      findOne: jest.fn(() => ({ exec: async () => profile })),
    } as any;
  }

  it('KYC approved after creation: stored 12 → refreshed 22 (KYC +10), saved once', async () => {
    const profile = makeProfile({ verification_status: 'approved' });
    const helperModel = makeHelperModel(profile);

    const out = await refreshHelperScoreSnapshot({ helperModel, helperId: String(profile.user_id) });

    expect(out).toBe(profile);
    expect(profile.performance_score).toBe(22);
    expect(profile.score_breakdown).toEqual({ distance: 0, skill: 12, rating: 0, kyc: 10 });
    expect(profile.save).toHaveBeenCalledTimes(1);
  });

  it('service registered after creation: skill 12 → 30, total 42 → 60', async () => {
    const profile = makeProfile({
      service_ids: [new Types.ObjectId()],
      rating: 5,
      verification_status: 'approved',
      performance_score: 42,
      score_breakdown: { distance: 0, skill: 12, rating: 20, kyc: 10 },
    });
    const helperModel = makeHelperModel(profile);

    await refreshHelperScoreSnapshot({ helperModel, helperId: String(profile.user_id) });

    expect(profile.performance_score).toBe(60);
    expect(profile.score_breakdown).toEqual({ distance: 0, skill: 30, rating: 20, kyc: 10 });
    expect(profile.save).toHaveBeenCalledTimes(1);
  });

  it('penalty timestamp aged out of the 7-day window: 4 → 3 cancels, score 37 → 42, stamp pruned', async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const oldStamp = new Date(now.getTime() - 8 * day);
    const stamps = [
      new Date(now.getTime() - 1 * day),
      new Date(now.getTime() - 2 * day),
      new Date(now.getTime() - 3 * day),
      oldStamp,
    ];
    const profile = makeProfile({
      rating: 5,
      verification_status: 'approved',
      cancellation_timestamps: stamps,
      cancellations_last_7_days: 4,
      penalty_points: 5,
      performance_score: 37,
      score_breakdown: { distance: 0, skill: 12, rating: 20, kyc: 10 },
    });
    const helperModel = makeHelperModel(profile);

    await refreshHelperScoreSnapshot({ helperModel, helperId: String(profile.user_id), now });

    expect(profile.cancellation_timestamps).toHaveLength(3);
    expect(profile.cancellation_timestamps).not.toContain(oldStamp);
    expect(profile.cancellations_last_7_days).toBe(3);
    expect(profile.penalty_points).toBe(0);
    expect(profile.performance_score).toBe(42);
    expect(profile.save).toHaveBeenCalledTimes(1);
  });

  it('already-current snapshot: no save at all', async () => {
    const profile = makeProfile({
      rating: 5,
      verification_status: 'approved',
      performance_score: 42,
      score_breakdown: { distance: 0, skill: 12, rating: 20, kyc: 10 },
    });
    const helperModel = makeHelperModel(profile);

    await refreshHelperScoreSnapshot({ helperModel, helperId: String(profile.user_id) });

    expect(profile.performance_score).toBe(42);
    expect(profile.save).not.toHaveBeenCalled();
  });

  it('no profile: returns null, no throw', async () => {
    const helperModel = makeHelperModel(null);

    await expect(
      refreshHelperScoreSnapshot({ helperModel, helperId: String(new Types.ObjectId()) }),
    ).resolves.toBeNull();
  });
});

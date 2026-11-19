import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';
import { SosBackupStatus } from './schemas/sos-backup.schema';
import { JobStatus, PaymentStatus } from '@homemate/types';

/**
 * R13-N4 — withdrawn SOS must not count as a cancellation.
 *
 * Live 2026-11-18: the 10:25 SOS on job 6afba6fb914ecfff7b2ff54f was
 * WITHDRAWN by the helper, yet the penalty still applied — createSos()
 * calls recordHelperCancellation(source='sos_initiation') unconditionally
 * at SOS creation, and cancelSos() never undid it (score 42→37, 4th stamp
 * in 7 days). After the fix, withdrawing an SOS removes the initiation
 * timestamp and waives the penalty event (if one was written), restoring
 * the score; the admin waive path reuses the same util.
 *
 * FAILS on base d06aa9c: cancelSos leaves the timestamp + event untouched
 * (score stays 37).
 */
describe('SosBackupService.cancelSos — R13-N4 withdrawn SOS negates the penalty', () => {
  const customerId = new Types.ObjectId();
  const originalHelperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const sosId = new Types.ObjectId();
  const helperIdStr = String(originalHelperId);

  function makeService(profile: any, penaltyEventModel: any) {
    const now = new Date();
    const sosDoc: any = {
      _id: sosId,
      job_id: jobId,
      job_title: 'Dọn nhà SOS',
      customer_id: customerId,
      original_helper_id: originalHelperId,
      status: SosBackupStatus.AWAITING_CUSTOMER,
      candidates: [],
      created_at: now,
      toObject: () => ({
        _id: sosId,
        job_id: jobId,
        job_title: 'Dọn nhà SOS',
        customer_id: customerId,
        original_helper_id: originalHelperId,
        status: SosBackupStatus.AWAITING_CUSTOMER,
        candidates: [],
        created_at: now,
      }),
    };
    const claimedDoc: any = {
      ...sosDoc,
      status: SosBackupStatus.CANCELLED,
      toObject: () => ({
        _id: sosId,
        job_id: jobId,
        job_title: 'Dọn nhà SOS',
        customer_id: customerId,
        original_helper_id: originalHelperId,
        status: SosBackupStatus.CANCELLED,
        candidates: [],
        created_at: now,
      }),
    };
    const sosModel: any = {
      findById: jest.fn(() => ({ exec: async () => sosDoc })),
      find: jest.fn(() => ({ sort: jest.fn(() => ({ exec: async () => [] })) })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => claimedDoc })),
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
    };
    const jobDoc: any = {
      _id: jobId,
      customer_id: customerId,
      helper_id: originalHelperId,
      status: JobStatus.CONFIRMED,
      payment_status: PaymentStatus.UNPAID,
      events: [],
      markModified: jest.fn(),
      save: jest.fn(async () => true),
    };
    const jobModel: any = {
      findById: jest.fn(() => ({ exec: async () => jobDoc })),
      countDocuments: jest.fn(() => ({ exec: async () => 0 })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
    };
    const helperModel: any = {
      findOne: jest.fn(() => ({ exec: async () => profile })),
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
    };
    const dummy = {} as never;
    const service = new SosBackupService(
      sosModel,
      jobModel,
      { findOne: jest.fn(() => ({ exec: async () => null })) } as never,
      helperModel,
      penaltyEventModel,
      {
        find: jest.fn(() => ({
          select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
        })),
      } as never,
      { emitToUser: jest.fn(), emitToJob: jest.fn() } as never,
      dummy,
      { create: jest.fn(async () => ({})) } as never,
      {
        refundCustomer: jest.fn(async () => ({})),
        getTotalPaidForJob: jest.fn(async () => 0),
      } as never,
      { restoreForJob: jest.fn(async () => ({ restored: false })) } as never,
      { reverseRedeemForJob: jest.fn(async () => ({ points_restored: 0 })) } as never,
      { get: jest.fn(() => undefined) } as never,
    );
    return { service, sosModel, sosDoc };
  }

  /** Profile matching the live case: base 42 (Skill 12 + Rating 20 + KYC 10), 4 stamps → penalty 5 → total 37. */
  function makeProfile(now: Date) {
    const day = 24 * 60 * 60 * 1000;
    return {
      user_id: originalHelperId,
      service_ids: [],
      rating: 5,
      verification_status: 'approved',
      cancellation_timestamps: [
        new Date(now.getTime() - 6 * day),
        new Date(now.getTime() - 5 * day),
        new Date(now.getTime() - 4 * day),
        new Date(now.getTime()),
      ],
      cancellations_last_7_days: 4,
      penalty_points: 5,
      performance_score: 37,
      score_breakdown: { distance: 0, skill: 12, rating: 20, kyc: 10 },
      score_updated_at: now,
      save: jest.fn(async () => true),
    };
  }

  function makePenaltyEventModel() {
    return {
      findOneAndUpdate: jest.fn(() => ({
        exec: jest.fn(async () => ({ status: 'waived' })),
      })),
    } as any;
  }

  it('withdrawing the 4th-cancel SOS restores the score 37 → 42 and waives the event', async () => {
    const now = new Date();
    const profile = makeProfile(now);
    const penaltyEventModel = makePenaltyEventModel();
    const { service } = makeService(profile, penaltyEventModel);

    await service.cancelSos(helperIdStr, String(sosId));

    expect(profile.cancellation_timestamps).toHaveLength(3);
    expect(profile.cancellations_last_7_days).toBe(3);
    expect(profile.penalty_points).toBe(0);
    expect(profile.performance_score).toBe(42);
    expect(profile.score_breakdown).toEqual({ distance: 0, skill: 12, rating: 20, kyc: 10 });
    expect(profile.save).toHaveBeenCalled();
    expect(penaltyEventModel.findOneAndUpdate).toHaveBeenCalledWith(
      { sos_id: sosId, status: { $ne: 'waived' } },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'waived',
          waive_reason: expect.stringContaining('withdrawn'),
        }),
      }),
      { new: true },
    );
  });

  it('already-resolved SOS throws and touches nothing (guard: only a live claim negates)', async () => {
    const now = new Date();
    const profile = makeProfile(now);
    const penaltyEventModel = makePenaltyEventModel();
    const { service, sosDoc } = makeService(profile, penaltyEventModel);
    sosDoc.status = SosBackupStatus.CANCELLED;

    await expect(service.cancelSos(helperIdStr, String(sosId))).rejects.toThrow(
      'Yêu cầu SOS này đã kết thúc',
    );
    expect(profile.save).not.toHaveBeenCalled();
    expect(penaltyEventModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('score still restores when no penalty event exists (in-threshold SOS)', async () => {
    const now = new Date();
    const profile = makeProfile(now);
    const penaltyEventModel = {
      findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
    } as any;
    const { service } = makeService(profile, penaltyEventModel);

    await service.cancelSos(helperIdStr, String(sosId));

    expect(profile.performance_score).toBe(42);
    expect(profile.cancellation_timestamps).toHaveLength(3);
  });
});

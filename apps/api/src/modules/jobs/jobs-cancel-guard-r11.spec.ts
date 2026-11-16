import { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { JobStatus } from '@homemate/types';

/**
 * M5 (R11): thợ hủy đơn IN_PROGRESS/PENDING_REVIEW bị từ chối thì KHÔNG được
 * ghi phạt. Trước R11, khối phạt (late_cancellation_count +1, risk_score +15,
 * recordHelperCancellation) chạy TRƯỚC guard P2-12 nên một lần hủy thất bại
 * vẫn tính như một lần hủy thật. Fix: guard chạy trước khối phạt.
 */
type Doc = Record<string, any>;

function makeJobsService(jobStatus: JobStatus) {
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  const jobRecord: Doc = {
    _id: jobId,
    customer_id: customerId,
    helper_id: helperId,
    status: jobStatus,
    title: 'Dọn dẹp nhà cửa',
    events: [],
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  const profile: Doc = {
    user_id: helperId,
    rating: 5,
    verification_status: 'approved',
    service_ids: ['svc1'],
    cancellation_timestamps: [],
    late_cancellation_count: 0,
    risk_score: 0,
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  const jobModel = {
    findById: jest.fn(() => ({ exec: async () => jobRecord })),
    findOneAndUpdate: jest.fn(() => ({ exec: async () => jobRecord })),
    countDocuments: jest.fn(() => ({ exec: async () => 0 })),
  };

  const quoteModel = {
    updateMany: jest.fn(() => ({ exec: async () => ({ modifiedCount: 0 }) })),
    find: jest.fn(() => ({
      select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
    })),
  };

  const helperModel = {
    findOne: jest.fn(() => ({ exec: async () => profile })),
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
  };

  const penaltyEventModel = { create: jest.fn(async () => ({})) };
  const gateway = { emitToJob: jest.fn(), emitToUser: jest.fn() };
  const notificationsService = { create: jest.fn(async () => ({})) };
  const dummy = {} as never;

  const service = new JobsService(
    jobModel as never,
    quoteModel as never,
    dummy, // contractModel
    dummy, // serviceModel
    helperModel as never,
    penaltyEventModel as never,
    dummy, // userModel
    gateway as never,
    notificationsService as never,
    dummy, // chatService
    dummy, // paymentsService
    dummy, // routingService
    dummy, // favoritesService
    { restoreForJob: jest.fn(async () => ({ restored: false })) } as never,
    { reverseRedeemForJob: jest.fn(async () => ({ points_restored: 0 })) } as never,
    dummy, // disputesService
  );

  return { service, jobRecord, profile, helperModel, penaltyEventModel, customerId, helperId, jobId };
}

describe('JobsService.cancelJob — rejected cancel records no penalty (M5/R11)', () => {
  it('thợ hủy đơn IN_PROGRESS → 400, không +late_cancellation_count, không +risk_score, không ghi mốc hủy', async () => {
    const { service, jobRecord, profile, helperModel, penaltyEventModel, helperId, jobId } =
      makeJobsService(JobStatus.IN_PROGRESS);

    await expect(
      service.cancelJob(String(helperId), 'helper', String(jobId), { reason: 'Bận đột xuất' }),
    ).rejects.toThrow('chỉ có thể khiếu nại');

    expect(jobRecord.status).toBe(JobStatus.IN_PROGRESS);
    expect(helperModel.updateOne).not.toHaveBeenCalled();
    expect(profile.cancellation_timestamps).toHaveLength(0);
    expect(profile.save).not.toHaveBeenCalled();
    expect(penaltyEventModel.create).not.toHaveBeenCalled();
  });

  it('thợ hủy đơn PENDING_REVIEW → 400, không ghi phạt', async () => {
    const { service, jobRecord, profile, helperModel, penaltyEventModel, helperId, jobId } =
      makeJobsService(JobStatus.PENDING_REVIEW);

    await expect(
      service.cancelJob(String(helperId), 'helper', String(jobId), { reason: 'Bận đột xuất' }),
    ).rejects.toThrow('chỉ có thể khiếu nại');

    expect(jobRecord.status).toBe(JobStatus.PENDING_REVIEW);
    expect(helperModel.updateOne).not.toHaveBeenCalled();
    expect(profile.cancellation_timestamps).toHaveLength(0);
    expect(profile.save).not.toHaveBeenCalled();
    expect(penaltyEventModel.create).not.toHaveBeenCalled();
  });

  it('thợ hủy đơn CONFIRMED → thành công, phạt vẫn được ghi như thường', async () => {
    const { service, jobRecord, profile, helperModel, helperId, jobId } =
      makeJobsService(JobStatus.CONFIRMED);

    const result = await service.cancelJob(String(helperId), 'helper', String(jobId), {
      reason: 'Bận đột xuất',
    });

    expect(result.status).toBe(JobStatus.CANCELLED);
    // Khối phạt gọi updateOne 1 lần với $inc late_cancellation_count/risk_score
    // (lần gọi updateOne còn lại là setHelperBusy(false) ở cuối luồng hủy).
    const penaltyCalls = (helperModel.updateOne.mock.calls as any[]).filter(
      (c: any[]) => c[1]?.$inc?.late_cancellation_count === 1,
    );
    expect(penaltyCalls).toHaveLength(1);
    expect((penaltyCalls[0] as any[])[1].$inc.risk_score).toBe(15);
    expect(profile.cancellation_timestamps).toHaveLength(1);
    expect(profile.save).toHaveBeenCalled();
  });
});

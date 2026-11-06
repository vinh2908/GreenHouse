import { Types } from 'mongoose';
import { DisputesService } from './disputes.service';
import { JobStatus } from '@homemate/types';

/** Spec B61: kháng nghị sau hoàn đủ tiền cần lý do mới. */
describe('DisputesService.appeal (B61)', () => {
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  function makeService(opts: {
    resolutionAction: 'refund_full' | 'refund_partial' | 'release_to_helper';
    refundAmount: number;
    totalPrice: number;
  }) {
    const caseDoc: any = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      customer_id: customerId,
      helper_id: helperId,
      status: 'resolved',
      reason: 'Thợ làm vỡ gương',
      resolution: {
        action: opts.resolutionAction,
        refund_amount: opts.refundAmount,
        admin_note: 'Đã hoàn tiền',
        resolved_at: new Date(),
      },
      appeal_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      timeline: [],
      save: jest.fn(async function (this: any) {
        return this;
      }),
    };
    const job: any = {
      _id: jobId,
      customer_id: customerId,
      helper_id: helperId,
      status: JobStatus.DISPUTED,
      fixed_price: opts.totalPrice,
      discount_amount: 0,
      loyalty_discount_amount: 0,
      events: [],
      save: jest.fn(async function (this: any) {
        return this;
      }),
    };
    const caseModel: any = {
      findOne: jest.fn(() => ({ exec: async () => caseDoc })),
    };
    const jobModel: any = {
      findById: jest.fn(() => ({ exec: async () => job })),
    };
    const contractModel: any = {
      findOne: jest.fn(() => ({
        exec: async () => ({ total_price: opts.totalPrice }),
      })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => ({}) })),
    };
    const service = new DisputesService(
      caseModel,
      jobModel,
      contractModel,
      { emitToJob: jest.fn(), emitToUser: jest.fn(), emitToAdmins: jest.fn() } as never,
      { create: jest.fn(async () => ({})) } as never,
      { get: jest.fn(() => undefined) } as never,
    );
    return { service, caseDoc, job };
  }

  it('hoàn đủ tiền (refund_full 300k/300k) + kháng nghị cùng lý do gốc → 400', async () => {
    const { service } = makeService({
      resolutionAction: 'refund_full',
      refundAmount: 300_000,
      totalPrice: 300_000,
    });
    await expect(
      service.appeal(String(jobId), String(customerId), 'customer', {
        reason: 'Thợ làm vỡ gương',
      } as never),
    ).rejects.toThrow('đã được hoàn đủ tiền');
  });

  it('hoàn đủ tiền + kháng nghị với lý do MỚI → mở lại phân xử (appealed)', async () => {
    const { service, caseDoc, job } = makeService({
      resolutionAction: 'refund_full',
      refundAmount: 300_000,
      totalPrice: 300_000,
    });
    const result = await service.appeal(String(jobId), String(customerId), 'customer', {
      reason: 'Phát hiện thêm hư hỏng tủ gỗ',
    } as never);
    expect(result.status).toBe('appealed');
    expect(caseDoc.appeal.reason).toBe('Phát hiện thêm hư hỏng tủ gỗ');
    expect(job.status).toBe(JobStatus.DISPUTED);
  });

  it('hoàn một phần (100k/300k) + cùng lý do gốc → vẫn được kháng nghị', async () => {
    const { service, caseDoc } = makeService({
      resolutionAction: 'refund_partial',
      refundAmount: 100_000,
      totalPrice: 300_000,
    });
    const result = await service.appeal(String(jobId), String(customerId), 'customer', {
      reason: 'Thợ làm vỡ gương',
    } as never);
    expect(result.status).toBe('appealed');
    expect(caseDoc.appeal).toBeDefined();
  });

  it('tiền đã trả cho thợ (release_to_helper) + cùng lý do gốc → vẫn được kháng nghị', async () => {
    const { service } = makeService({
      resolutionAction: 'release_to_helper',
      refundAmount: 0,
      totalPrice: 300_000,
    });
    const result = await service.appeal(String(jobId), String(customerId), 'customer', {
      reason: 'Thợ làm vỡ gương',
    } as never);
    expect(result.status).toBe('appealed');
  });
});

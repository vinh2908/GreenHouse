import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ClaimsService } from './claims.service';
import { InsuranceClaim } from './schemas/insurance-claim.schema';
import { Job, Contract } from '../jobs/schemas/job.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';

describe('ClaimsService - F14 atomic approve', () => {
  let service: ClaimsService;
  let claimModel: any;
  let paymentsService: any;

  const claimId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const txId = new Types.ObjectId();

  function makeClaimDoc() {
    return {
      _id: claimId,
      status: 'submitted',
      requested_amount: 500000,
      job_id: jobId,
      customer_id: customerId,
      timeline: [],
    };
  }

  beforeEach(async () => {
    let claimCalls = 0;
    claimModel = {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(makeClaimDoc()),
      }),
      // Giả lập cập nhật nguyên tử: chỉ lần chiếm quyền duyệt đầu tiên
      // (filter status in [submitted, under_review]) lọt; lần sau trả null.
      findOneAndUpdate: jest.fn().mockImplementation((filter: any) => {
        const isClaimStep =
          filter?.status && typeof filter.status === 'object' && filter.status.$in;
        if (isClaimStep) {
          claimCalls += 1;
          const claimed = claimCalls === 1 ? { ...makeClaimDoc(), status: 'approved' } : null;
          return { exec: jest.fn().mockResolvedValue(claimed) };
        }
        // Bước ghi 'paid': chỉ request đang giữ 'approved' mới ghi được.
        return {
          exec: jest.fn().mockResolvedValue({ ...makeClaimDoc(), status: 'paid' }),
        };
      }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };

    paymentsService = {
      refundCustomer: jest.fn().mockResolvedValue({ _id: txId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimsService,
        { provide: getModelToken(InsuranceClaim.name), useValue: claimModel },
        { provide: getModelToken(Job.name), useValue: {} },
        { provide: getModelToken(Contract.name), useValue: {} },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue({}) },
        },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    service = module.get<ClaimsService>(ClaimsService);
  });

  it('F14: 2 request duyệt song song -> 1 thành công, 1 trả 409, chỉ 1 giao dịch bồi thường', async () => {
    const dto: any = { action: 'approve', approved_amount: 300000 };
    const adminId = String(new Types.ObjectId());
    const results = await Promise.allSettled([
      service.adminReview(adminId, String(claimId), dto),
      service.adminReview(adminId, String(claimId), dto),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.status).toBe(409);
    expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      String(customerId),
      String(jobId),
      300000,
      expect.any(String),
    );
    // Cờ điều kiện nguyên tử phải có trong filter chiếm quyền duyệt.
    const claimFilter = claimModel.findOneAndUpdate.mock.calls.find((c: any[]) =>
      c[0]?.status?.$in?.includes('submitted'),
    )[0];
    expect(claimFilter.$or).toEqual(
      expect.arrayContaining([{ payout_transaction_id: { $exists: false } }]),
    );
  });
});

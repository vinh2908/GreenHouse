import { Types } from 'mongoose';
import { JobStatus, PaymentStatus } from '@homemate/types';
import { SosBackupService } from './sos-backup.service';

/**
 * M6 (R11): SOS hủy đơn sau khi khách chấp nhận phụ lục tăng giá phải hoàn
 * đúng số tiền gốc đang giữ. Chấp nhận phụ lục đưa đơn PAID về UNPAID trong
 * khi tiền gốc vẫn đang giữ; code cũ gate hoàn tiền trên payment_status ===
 * PAID nên SOS hủy trong cửa sổ đó hoàn 0₫ và không gắn cờ retry. Fix: hoàn
 * theo số tiền THỰC THU (getTotalPaidForJob), min(với net theo hợp đồng).
 */
type Doc = Record<string, any>;

function makeService(opts: {
  actuallyPaid: number;
  paymentStatus: PaymentStatus;
  contractTotal?: number;
}) {
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const sosId = new Types.ObjectId();

  const job: Doc = {
    _id: jobId,
    customer_id: customerId,
    helper_id: helperId,
    status: JobStatus.CONFIRMED,
    payment_status: opts.paymentStatus,
    payment_method: 'vietqr',
    discount_amount: 0,
    loyalty_discount_amount: 0,
    title: 'Dọn nhà',
    events: [],
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  // Hợp đồng đã tăng giá sau phụ lục: 400.000₫ (gốc 350.000₫).
  const contract: Doc = {
    _id: new Types.ObjectId(),
    total_price: opts.contractTotal ?? 400_000,
    status: 'active',
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  const sos: Doc = {
    _id: sosId,
    job_id: jobId,
    job_title: 'Dọn nhà',
    original_helper_id: helperId,
    customer_id: customerId,
  };

  const jobModel = {
    findById: jest.fn(() => ({ exec: async () => job })),
    countDocuments: jest.fn(() => ({ exec: async () => 0 })),
    findOneAndUpdate: jest.fn(() => ({ exec: async () => job })),
  };
  const contractModel = {
    findOne: jest.fn(() => ({ exec: async () => contract })),
  };
  const sosModel = {
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
  };
  const helperModel = {
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
  };
  const gateway = { emitToUser: jest.fn(), emitToJob: jest.fn() };
  const notificationsService = { create: jest.fn(async () => ({})) };
  const paymentsService = {
    refundCustomer: jest.fn(async () => ({})),
    getTotalPaidForJob: jest.fn(async () => opts.actuallyPaid),
  };
  const dummy = {} as never;

  const service = new SosBackupService(
    sosModel as never,
    jobModel as never,
    contractModel as never,
    helperModel as never,
    dummy, // penaltyEventModel
    dummy, // userModel
    gateway as never,
    dummy, // chatService
    notificationsService as never,
    paymentsService as never,
    { restoreForJob: jest.fn(async () => ({ restored: false })) } as never,
    { reverseRedeemForJob: jest.fn(async () => ({ points_restored: 0 })) } as never,
    { get: () => undefined } as never, // configService
  );
  // Cô lập logic hoàn tiền: khôi phục quyền lợi đã có spec riêng.
  (service as any).restoreJobBenefitsOnSosCancel = jest.fn().mockResolvedValue(undefined);

  return { service, job, sos, paymentsService, customerId, jobId };
}

describe('SosBackupService.cancelJobWithSosPolicy — refund actual paid after amendment (M6/R11)', () => {
  it('đơn UNPAID sau phụ lục (đã thu gốc 350.000₫) → hoàn đúng 350.000₫, không hoàn 0₫', async () => {
    const { service, job, sos, paymentsService } = makeService({
      actuallyPaid: 350_000,
      paymentStatus: PaymentStatus.UNPAID,
    });

    const result = await (service as any).cancelJobWithSosPolicy(sos, 'customer');

    expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      String(job.customer_id),
      String(job._id),
      350_000,
      expect.any(String),
    );
    expect(result.refundAmount).toBe(350_000);
    expect(result.refundFailed).toBe(false);
    expect(job.payment_status).toBe(PaymentStatus.REFUNDED);
  });

  it('đơn PAID bình thường (không phụ lục) → hoàn đúng net theo hợp đồng (350.000₫)', async () => {
    const { service, sos, paymentsService } = makeService({
      actuallyPaid: 350_000,
      paymentStatus: PaymentStatus.PAID,
      contractTotal: 350_000,
    });

    const result = await (service as any).cancelJobWithSosPolicy(sos, 'customer');

    expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    expect(result.refundAmount).toBe(350_000);
  });

  it('đơn UNPAID chưa từng thu tiền (thực thu 0) → hoàn 0₫, không gọi refund', async () => {
    const { service, sos, paymentsService } = makeService({
      actuallyPaid: 0,
      paymentStatus: PaymentStatus.UNPAID,
    });

    const result = await (service as any).cancelJobWithSosPolicy(sos, 'customer');

    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    expect(result.refundAmount).toBe(0);
  });
});

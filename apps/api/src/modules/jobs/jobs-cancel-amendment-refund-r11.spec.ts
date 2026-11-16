import { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { JobStatus, PaymentStatus } from '@homemate/types';

/**
 * M6 (R11) — phía cancelJob thường: cùng gate payment_status như SOS cancel.
 * Đơn PAID chấp nhận phụ lục tăng giá → payment_status về UNPAID trong khi
 * tiền gốc vẫn đang giữ; hủy đơn trong cửa sổ đó hoàn 0₫. Fix: hoàn theo số
 * tiền THỰC THU (getTotalPaidForJob), min(với net theo hợp đồng) — cũng là
 * hướng sửa L3 (không hoàn nhiều hơn số đã thu).
 */
type Doc = Record<string, any>;

function makeJobsService(opts: {
  paymentStatus: PaymentStatus;
  actuallyPaid: number;
  contractTotal?: number;
}) {
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  const jobRecord: Doc = {
    _id: jobId,
    customer_id: customerId,
    helper_id: helperId,
    status: JobStatus.CONFIRMED,
    payment_status: opts.paymentStatus,
    payment_method: 'vietqr',
    discount_amount: 0,
    loyalty_discount_amount: 0,
    fixed_price: 350_000,
    title: 'Dọn dẹp nhà cửa',
    events: [],
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  const contract: Doc = {
    _id: new Types.ObjectId(),
    total_price: opts.contractTotal ?? 400_000,
    status: 'active',
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  const jobModel = {
    findById: jest.fn(() => ({ exec: async () => jobRecord })),
    findOneAndUpdate: jest.fn(() => ({ exec: async () => jobRecord })),
    countDocuments: jest.fn(() => ({ exec: async () => 0 })),
  };
  const contractModel = {
    findOne: jest.fn(() => ({ exec: async () => contract })),
  };
  const quoteModel = {
    updateMany: jest.fn(() => ({ exec: async () => ({ modifiedCount: 0 }) })),
    find: jest.fn(() => ({
      select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
    })),
  };
  const helperModel = {
    findOne: jest.fn(() => ({ exec: async () => ({}) })),
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
  };
  const penaltyEventModel = { create: jest.fn(async () => ({})) };
  const gateway = { emitToJob: jest.fn(), emitToUser: jest.fn() };
  const notificationsService = { create: jest.fn(async () => ({})) };
  const paymentsService = {
    refundCustomer: jest.fn(async () => ({})),
    getTotalPaidForJob: jest.fn(async () => opts.actuallyPaid),
    getTotalRefundedForJob: jest.fn(async () => 0),
  };
  const dummy = {} as never;

  const service = new JobsService(
    jobModel as never,
    quoteModel as never,
    contractModel as never,
    dummy, // serviceModel
    helperModel as never,
    penaltyEventModel as never,
    dummy, // userModel
    gateway as never,
    notificationsService as never,
    dummy, // chatService
    paymentsService as never,
    dummy, // routingService
    dummy, // favoritesService
    { restoreForJob: jest.fn(async () => ({ restored: false })) } as never,
    { reverseRedeemForJob: jest.fn(async () => ({ points_restored: 0 })) } as never,
    dummy, // disputesService
  );

  return { service, jobRecord, paymentsService, customerId, helperId, jobId };
}

describe('JobsService.cancelJob — refund actual paid after amendment (M6/L3, R11)', () => {
  it('đơn UNPAID sau phụ lục (đã thu gốc 350.000₫) → hoàn đúng 350.000₫', async () => {
    const { service, jobRecord, paymentsService, customerId, jobId } = makeJobsService({
      paymentStatus: PaymentStatus.UNPAID,
      actuallyPaid: 350_000,
    });

    await service.cancelJob(String(customerId), 'customer', String(jobId), {
      reason: 'Đổi ý',
    });

    expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      String(customerId),
      String(jobId),
      350_000,
      expect.any(String),
    );
    expect(jobRecord.payment_status).toBe(PaymentStatus.REFUNDED);
  });

  it('đơn PAID bình thường (không phụ lục) → hoàn đúng net theo hợp đồng (350.000₫)', async () => {
    const { service, paymentsService, customerId, jobId } = makeJobsService({
      paymentStatus: PaymentStatus.PAID,
      actuallyPaid: 350_000,
      contractTotal: 350_000,
    });

    await service.cancelJob(String(customerId), 'customer', String(jobId), {
      reason: 'Đổi ý',
    });

    expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      String(customerId),
      String(jobId),
      350_000,
      expect.any(String),
    );
  });

  it('đơn UNPAID chưa từng thu tiền (thực thu 0) → hoàn 0₫, không gọi refund', async () => {
    const { service, paymentsService, customerId, jobId } = makeJobsService({
      paymentStatus: PaymentStatus.UNPAID,
      actuallyPaid: 0,
    });

    await service.cancelJob(String(customerId), 'customer', String(jobId), {
      reason: 'Đổi ý',
    });

    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
  });
});

import { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { JobStatus, PaymentStatus } from '@homemate/types';

/**
 * L1 (R11): đổi phương thức cash→VietQR ở bước nghiệm thu không được lách
 * gate tiền mặt. Đơn đã thu tiền mặt (payment_method 'cash' + PAID) mà
 * nghiệm thu với payment_method 'vietqr' sẽ qua nhánh online rồi kẹt ở bước
 * giải ngân với lỗi gây hiểu lầm ("chưa có khoản thanh toán trực tuyến đã
 * xác minh"). Fix: gate + nhánh giải ngân theo tiền THỰC THU — đơn đã thu
 * tiền mặt thì luôn chạy gate tiền mặt và nhánh tiền mặt, bất kể dto chọn
 * phương thức gì.
 */
const CASH_NOT_CONFIRMED_MSG = 'Thợ chưa xác nhận đã nhận tiền mặt';

type Doc = Record<string, any>;

function makeService(jobOverrides: Doc) {
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  const jobDoc: Doc = {
    _id: jobId,
    customer_id: customerId,
    helper_id: helperId,
    title: 'TEST L1',
    status: JobStatus.PENDING_REVIEW,
    payment_method: 'cash',
    payment_status: PaymentStatus.PAID,
    helper_cash_confirmed: false,
    helper_cash_confirmed_at: undefined,
    completion_photos: ['photo1.jpg'],
    is_warranty: false,
    review_reminder_sent: true,
    events: [],
    save: jest.fn().mockResolvedValue(undefined),
    ...jobOverrides,
  };

  const contract: Doc = {
    _id: new Types.ObjectId(),
    total_price: 500_000,
    platform_fee: 75_000,
    helper_receives: 425_000,
    status: 'active',
    save: jest.fn().mockResolvedValue({}),
  };

  const jobModel = {
    findById: jest.fn(() => ({ exec: async () => jobDoc })),
    findOneAndUpdate: jest.fn(() => ({
      exec: async () => ({ ...jobDoc, status: JobStatus.COMPLETED }),
    })),
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
    countDocuments: jest.fn(() => ({ exec: async () => 0 })),
  };
  const contractModel = {
    findOne: jest.fn(() => ({ exec: async () => contract })),
  };
  const helperModel = {
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
  };
  const gateway = { emitToJob: jest.fn(), emitToUser: jest.fn() };
  const notificationsService = { create: jest.fn(async () => ({})) };
  const paymentsService = {
    getTotalPaidForJob: jest.fn(async () => 500_000),
    hasVerifiedWalletPayment: jest.fn(async () => false),
    hasSimulatedOnlinePayment: jest.fn(async () => false),
    creditWallet: jest.fn(async () => ({})),
    deductWallet: jest.fn(async () => ({})),
    deductWalletSimulated: jest.fn(async () => ({})),
  };
  const loyaltyService = { awardForJob: jest.fn(async () => 0) };
  const dummy = {} as never;

  const service = new JobsService(
    jobModel as never,
    { find: jest.fn(() => ({ exec: async () => [] })) } as never, // quoteModel
    contractModel as never,
    dummy, // serviceModel
    helperModel as never,
    dummy, // penaltyEventModel
    dummy, // userModel
    gateway as never,
    notificationsService as never,
    dummy, // chatService
    paymentsService as never,
    dummy, // routingService
    dummy, // favoritesService
    dummy, // vouchersService
    loyaltyService as never,
    dummy, // disputesService
  );
  const deductCashCommission = jest
    .spyOn(service as any, 'deductCashCommission')
    .mockResolvedValue(undefined);
  const creditJobPayout = jest
    .spyOn(service as any, 'creditJobPayout')
    .mockResolvedValue(undefined);
  return { service, jobDoc, deductCashCommission, creditJobPayout, customerId, jobId };
}

describe('JobsService.approveCompletion — cash→VietQR method switch hits the cash gate (L1/R11)', () => {
  it('đơn cash đã thu tiền, thợ chưa xác nhận, nghiệm thu bằng vietqr → lỗi xác nhận tiền mặt (không phải lỗi giải ngân)', async () => {
    const { service, customerId, jobId, deductCashCommission } = makeService({});

    await expect(
      service.approveCompletion(String(customerId), String(jobId), {
        rating: 5,
        review: 'Tốt',
        payment_method: 'vietqr',
      } as any),
    ).rejects.toThrow(CASH_NOT_CONFIRMED_MSG);

    expect(deductCashCommission).not.toHaveBeenCalled();
  });

  it('đơn cash đã thu tiền, thợ ĐÃ xác nhận, nghiệm thu bằng vietqr → chạy nhánh tiền mặt (khấu trừ hoa hồng), không kẹt giải ngân online', async () => {
    const { service, customerId, jobId, deductCashCommission, creditJobPayout } = makeService({
      helper_cash_confirmed: true,
    });

    const result = await service.approveCompletion(String(customerId), String(jobId), {
      rating: 5,
      review: 'Tốt',
      payment_method: 'vietqr',
    } as any);

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(deductCashCommission).toHaveBeenCalledTimes(1);
    expect(creditJobPayout).not.toHaveBeenCalled();
  });

  it('đơn online (vietqr, PAID, ví thật) nghiệm thu bằng vietqr → giải ngân online như thường', async () => {
    const { service, customerId, jobId, deductCashCommission, creditJobPayout } = makeService({
      payment_method: 'vietqr',
      helper_cash_confirmed: undefined,
    });
    // Ghi đè mock ví thật cho case online.
    (service as any).paymentsService.hasVerifiedWalletPayment = jest.fn(async () => true);

    const result = await service.approveCompletion(String(customerId), String(jobId), {
      rating: 5,
      review: 'Tốt',
      payment_method: 'vietqr',
    } as any);

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(creditJobPayout).toHaveBeenCalledTimes(1);
    expect(deductCashCommission).not.toHaveBeenCalled();
  });

  it('đơn cash CHƯA thu tiền (UNPAID) nghiệm thu bằng vietqr → lỗi chưa thanh toán trực tuyến như cũ (không lôi gate tiền mặt vào)', async () => {
    const { service, customerId, jobId } = makeService({
      payment_status: PaymentStatus.UNPAID,
    });

    await expect(
      service.approveCompletion(String(customerId), String(jobId), {
        rating: 5,
        review: 'Tốt',
        payment_method: 'vietqr',
      } as any),
    ).rejects.toThrow('chưa được thanh toán trực tuyến');
  });
});

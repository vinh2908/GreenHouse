import { Types } from 'mongoose';
import { JobStatus, PaymentStatus } from '@homemate/types';
import { SosBackupService } from './sos-backup.service';

/**
 * LM1 (R11): SOS hủy đơn tiền mặt — khách phải được báo rằng tiền mặt cần
 * đối soát trực tiếp với thợ. Code cũ: nhánh hoàn tiền bỏ qua đơn cash
 * (refund 0₫) và thông báo cho khách chỉ nói "đã hủy theo chính sách SOS"
 * — khách tưởng sẽ có hoàn tiền vào ví trong khi tiền mặt đang ở tay thợ.
 * Fix: khi đơn cash ĐÃ thu tiền (PAID), thông báo cho khách nói rõ liên hệ
 * trực tiếp với thợ để nhận lại tiền mặt; ghi chú tương tự vào event của
 * đơn và thông báo cho thợ (trả lại tiền mặt trực tiếp cho khách).
 */
type Doc = Record<string, any>;

function makeService(opts: { paymentMethod: string; paymentStatus: PaymentStatus }) {
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
    payment_method: opts.paymentMethod,
    discount_amount: 0,
    loyalty_discount_amount: 0,
    title: 'Dọn nhà',
    events: [],
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  const contract: Doc = {
    _id: new Types.ObjectId(),
    total_price: 400_000,
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
    getTotalPaidForJob: jest.fn(async () => 400_000),
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
  (service as any).restoreJobBenefitsOnSosCancel = jest.fn().mockResolvedValue(undefined);

  return { service, job, sos, notificationsService, paymentsService, customerId, helperId };
}

function customerNotification(notificationsService: { create: jest.Mock }, customerId: Types.ObjectId) {
  const call = notificationsService.create.mock.calls.find(
    ([arg]: [Doc]) => arg.userId === String(customerId),
  );
  if (!call) throw new Error('customer notification was not sent');
  return call[0] as Doc;
}

describe('SosBackupService.cancelJobWithSosPolicy — cash SOS cancel tells the customer to settle cash with the helper (LM1/R11)', () => {
  it('đơn cash ĐÃ thu tiền, khách chọn hủy → thông báo khách nói rõ nhận lại tiền mặt trực tiếp từ thợ, không hoàn ví', async () => {
    const { service, job, sos, notificationsService, paymentsService, customerId } = makeService({
      paymentMethod: 'cash',
      paymentStatus: PaymentStatus.PAID,
    });
    const result = await (service as any).cancelJobWithSosPolicy(sos, 'customer');

    expect(result.refundAmount).toBe(0);
    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    const note = customerNotification(notificationsService, customerId);
    expect(note.body).toMatch(/tiền mặt/);
    expect(note.body).toMatch(/trực tiếp với thợ|trực tiếp cho khách|liên hệ.*thợ/i);
    // Event của đơn cũng phải ghi rõ tiền mặt cần đối soát trực tiếp.
    const eventNote = (job.events as Doc[]).map(e => e.note).join(' ');
    expect(eventNote).toMatch(/tiền mặt/i);
  });

  it('đơn cash ĐÃ thu tiền, khách không phản hồi (timeout) → thông báo khách vẫn nói rõ nhận lại tiền mặt trực tiếp từ thợ', async () => {
    const { service, sos, notificationsService, customerId } = makeService({
      paymentMethod: 'cash',
      paymentStatus: PaymentStatus.PAID,
    });
    await (service as any).cancelJobWithSosPolicy(sos, 'timeout');

    const note = customerNotification(notificationsService, customerId);
    expect(note.body).toMatch(/tiền mặt/);
    expect(note.body).toMatch(/trực tiếp với thợ|liên hệ.*thợ/i);
  });

  it('đơn cash CHƯA thu tiền (UNPAID) → không nhắc chuyện tiền mặt (không có tiền nào cần đối soát)', async () => {
    const { service, sos, notificationsService, customerId } = makeService({
      paymentMethod: 'cash',
      paymentStatus: PaymentStatus.UNPAID,
    });
    await (service as any).cancelJobWithSosPolicy(sos, 'customer');

    const note = customerNotification(notificationsService, customerId);
    expect(note.body).not.toMatch(/tiền mặt/);
  });

  it('đơn online (vietqr, PAID) → hoàn vào ví như thường, không nhắc tiền mặt', async () => {
    const { service, sos, notificationsService, paymentsService, customerId } = makeService({
      paymentMethod: 'vietqr',
      paymentStatus: PaymentStatus.PAID,
    });
    const result = await (service as any).cancelJobWithSosPolicy(sos, 'customer');

    expect(result.refundAmount).toBe(400_000);
    expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    const note = customerNotification(notificationsService, customerId);
    expect(note.body).not.toMatch(/tiền mặt/);
    expect(note.body).toMatch(/hoàn vào ví/);
  });
});

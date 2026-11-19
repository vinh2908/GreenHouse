import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';
import { SosBackupStatus } from './schemas/sos-backup.schema';
import { JobStatus, PaymentStatus } from '@homemate/types';

/**
 * R12 — SOS cancel reasons + refund wording + dispatch status
 * (items 21, 22, 23).
 *
 * Item 21: hết hạn tìm thợ thay thế (rematch expiry) bị ghi nhận sai là
 * "khách không phản hồi trong hạn" — expireSos gọi cancelJobWithSosPolicy
 * với 'timeout' dù khách ĐÃ phản hồi đúng hạn (chọn đổi người). Sau sửa:
 * expireSos truyền 'rematch_expired' và mọi chuỗi lý do (cancellation_reason,
 * event, lý do hoàn tiền, thông báo thợ) nói đúng nguyên nhân.
 *
 * Item 22: thông báo hủy đơn khẳng định đã hoàn tiền vào ví dù đơn chưa từng
 * trả tiền (hoàn 0₫) — tiêu đề 'Đơn đã hủy & hoàn tiền theo chính sách SOS'
 * và (ở expireSos) 'Không tìm được thợ thay, đã hoàn tiền' + 'đã hoàn tiền
 * vào ví của bạn'. Sau sửa: wording theo đúng số tiền thực hoàn (0₫ khi
 * chưa trả); đơn tiền mặt đã thu thì đối soát trực tiếp với thợ.
 *
 * Item 23: hồ sơ SOS (dispatch record) phải chuyển sang trạng thái kết thúc
 * khi hủy đơn theo chính sách SOS — chốt chặn trong cancelJobWithSosPolicy
 * (các luồng gọi đã claim trạng thái trước đó). Màn lịch sử SOS phía khách
 * cũng đã map đủ trạng thái thật ('accepted' / 'customer_cancelled' /
 * 'decision_timeout') thay vì rơi vào "Đang xử lý".
 *
 * FAILS on base 582d57b: (21) cancellation_reason chứa 'không phản hồi';
 * (22) tiêu đề hủy đơn vẫn ghi 'hoàn tiền' khi hoàn 0₫; (23) không có
 * updateOne nào set status kết thúc cho hồ sơ SOS.
 */
describe('SosBackupService.cancelJobWithSosPolicy / expireSos — R12 items 21, 22, 23', () => {
  const customerId = new Types.ObjectId();
  const originalHelperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const sosId = new Types.ObjectId();

  let sosModel: any;
  let jobModel: any;
  let contractModel: any;
  let userModel: any;
  let gateway: any;
  let notificationsService: any;
  let paymentsService: any;

  function makeJob(over: Record<string, unknown> = {}): any {
    return {
      _id: jobId,
      customer_id: customerId,
      helper_id: originalHelperId,
      status: JobStatus.CONFIRMED,
      payment_status: PaymentStatus.UNPAID,
      payment_method: 'vietqr',
      title: 'Dọn nhà SOS',
      events: [],
      markModified: jest.fn(),
      save: jest.fn(async () => true),
      ...over,
    };
  }

  function makeContract(totalPrice = 50_000): any {
    return {
      total_price: totalPrice,
      helper_receives: 42_500,
      platform_fee: 7_500,
      status: 'active',
      save: jest.fn(async () => true),
    };
  }

  function makeSos(over: Record<string, unknown> = {}): any {
    return {
      _id: sosId,
      job_id: jobId,
      job_title: 'Dọn nhà SOS',
      customer_id: customerId,
      original_helper_id: originalHelperId,
      status: SosBackupStatus.PENDING,
      candidates: [],
      ...over,
    };
  }

  function makeService(jobDoc: any, contractDoc: any, totalPaid = 0) {
    sosModel = {
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => ({}) })),
    };
    jobModel = {
      findById: jest.fn(() => ({ exec: async () => jobDoc })),
      countDocuments: jest.fn(() => ({ exec: async () => 0 })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
    };
    contractModel = {
      findOne: jest.fn(() => ({ exec: async () => contractDoc })),
    };
    userModel = {
      find: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
      })),
    };
    gateway = { emitToUser: jest.fn(), emitToJob: jest.fn() };
    notificationsService = { create: jest.fn(async () => ({})) };
    paymentsService = {
      refundCustomer: jest.fn(async () => ({})),
      getTotalPaidForJob: jest.fn(async () => totalPaid),
    };
    const dummy = {} as never;
    const service = new SosBackupService(
      sosModel,
      jobModel,
      contractModel,
      { updateOne: jest.fn(() => ({ exec: async () => ({}) })) } as never,
      dummy, // penaltyEventModel
      userModel,
      gateway as never,
      dummy, // chatService
      notificationsService as never,
      paymentsService as never,
      { restoreForJob: jest.fn(async () => ({ restored: false })) } as never,
      { reverseRedeemForJob: jest.fn(async () => ({ points_restored: 0 })) } as never,
      { get: jest.fn(() => undefined) } as never, // configService
    );
    return service;
  }

  const notiFor = (userId: Types.ObjectId, type?: string) =>
    (notificationsService.create as jest.Mock).mock.calls
      .map(c => c[0])
      .filter(n => n.userId === String(userId) && (!type || n.type === type));

  // ─── Item 21: rematch expiry ≠ customer no-response ───────────────────────

  it('item 21: expireSos (hết hạn tìm thợ thay) → cancellation_reason nói hết hạn tìm thợ, KHÔNG nói khách không phản hồi', async () => {
    const jobDoc = makeJob();
    const service = makeService(jobDoc, makeContract(), 0);
    const claimedSos = makeSos({ status: SosBackupStatus.EXPIRED });
    (sosModel.findOneAndUpdate as jest.Mock).mockReturnValue({
      exec: async () => claimedSos,
    });

    await (service as any).expireSos(makeSos(), 'ttl');

    expect(jobDoc.cancellation_reason).toContain('hết hạn tìm thợ thay thế');
    expect(jobDoc.cancellation_reason).not.toContain('không phản hồi');
    expect(jobDoc.events[0].note).toContain('hết hạn tìm thợ thay thế');
    // Thông báo thợ cũng nói đúng nguyên nhân.
    const helperNotis = notiFor(originalHelperId);
    const expiredNoti = helperNotis.find(n => n.title === 'Chưa có thợ thay thế phù hợp');
    expect(expiredNoti?.body).toContain('đồng ý đổi người');
    expect(expiredNoti?.body).not.toContain('không phản hồi');
  });

  it('item 21 (đối chứng): hết hạn chờ khách quyết định → vẫn ghi khách không phản hồi', async () => {
    const jobDoc = makeJob();
    const service = makeService(jobDoc, makeContract(), 0);

    await (service as any).cancelJobWithSosPolicy(makeSos(), 'timeout');

    expect(jobDoc.cancellation_reason).toContain('khách không phản hồi trong hạn');
  });

  it('item 21: cancel với rematch_expired → lý do hoàn tiền ghi hết hạn tìm thợ (không ghi không phản hồi)', async () => {
    const jobDoc = makeJob();
    const service = makeService(jobDoc, makeContract(), 50_000);

    await (service as any).cancelJobWithSosPolicy(makeSos(), 'rematch_expired');

    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      String(customerId),
      String(jobId),
      50_000,
      'Hủy đơn do thợ gặp sự cố (SOS) — hết hạn tìm thợ thay thế',
    );
    expect(jobDoc.cancellation_reason).toContain('hết hạn tìm thợ thay thế');
  });

  // ─── Item 22: refund wording theo số tiền thực hoàn ───────────────────────

  it('item 22: hủy đơn chưa từng trả tiền (hoàn 0₫) → thông báo KHÔNG ghi đã hoàn tiền', async () => {
    const jobDoc = makeJob();
    const service = makeService(jobDoc, makeContract(), 0);

    await (service as any).cancelJobWithSosPolicy(makeSos(), 'timeout');

    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    const customerNotis = notiFor(customerId);
    expect(customerNotis).toHaveLength(1);
    expect(customerNotis[0].title).toBe('Đơn đã hủy theo chính sách SOS');
    expect(customerNotis[0].title).not.toContain('hoàn tiền');
    expect(customerNotis[0].body).toContain('không có khoản hoàn tiền');
    expect(customerNotis[0].body).not.toContain('hoàn tiền vào ví');
  });

  it('item 22 (đối chứng): hủy đơn đã trả online → thông báo ghi đúng đã hoàn tiền vào ví', async () => {
    const jobDoc = makeJob();
    const service = makeService(jobDoc, makeContract(), 50_000);

    await (service as any).cancelJobWithSosPolicy(makeSos(), 'customer');

    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      String(customerId),
      String(jobId),
      50_000,
      expect.any(String),
    );
    const customerNotis = notiFor(customerId);
    expect(customerNotis[0].title).toBe('Đơn đã hủy & hoàn tiền theo chính sách SOS');
    expect(customerNotis[0].body).toContain('50.000₫ đã được hoàn vào ví của bạn');
  });

  it('item 22: expireSos trên đơn chưa trả tiền → thông báo hết hạn KHÔNG ghi đã hoàn tiền', async () => {
    const jobDoc = makeJob();
    const service = makeService(jobDoc, makeContract(), 0);
    const claimedSos = makeSos({ status: SosBackupStatus.EXPIRED });
    (sosModel.findOneAndUpdate as jest.Mock).mockReturnValue({
      exec: async () => claimedSos,
    });

    await (service as any).expireSos(makeSos(), 'ttl');

    const expiredNotis = notiFor(customerId).filter(n =>
      n.title.includes('Không tìm được thợ thay'),
    );
    expect(expiredNotis).toHaveLength(1);
    expect(expiredNotis[0].title).toBe('Không tìm được thợ thay, đơn đã hủy');
    expect(expiredNotis[0].body).toContain('không có khoản hoàn tiền');
    expect(expiredNotis[0].body).not.toContain('hoàn tiền vào ví');
  });

  it('item 22: expireSos trên đơn tiền mặt đã thu → thông báo đối soát trực tiếp, không hoàn ví', async () => {
    const jobDoc = makeJob({ payment_method: 'cash', payment_status: PaymentStatus.PAID });
    const service = makeService(jobDoc, makeContract(), 0);
    const claimedSos = makeSos({ status: SosBackupStatus.EXPIRED });
    (sosModel.findOneAndUpdate as jest.Mock).mockReturnValue({
      exec: async () => claimedSos,
    });

    await (service as any).expireSos(makeSos(), 'ttl');

    const expiredNotis = notiFor(customerId).filter(n =>
      n.title.includes('Không tìm được thợ thay'),
    );
    expect(expiredNotis[0].body).toContain('liên hệ trực tiếp với thợ');
    expect(expiredNotis[0].body).not.toContain('hoàn tiền vào ví');
  });

  // ─── Item 23: dispatch record status on resolution ────────────────────────

  it.each([
    ['customer', SosBackupStatus.CUSTOMER_CANCELLED],
    ['timeout', SosBackupStatus.DECISION_TIMEOUT],
    ['rematch_expired', SosBackupStatus.EXPIRED],
  ] as const)(
    'item 23: cancelJobWithSosPolicy (%s) trên hồ sơ còn active → hồ sơ chuyển sang %s',
    async (by, expectedStatus) => {
      const jobDoc = makeJob();
      const service = makeService(jobDoc, makeContract(), 0);

      await (service as any).cancelJobWithSosPolicy(
        makeSos({ status: SosBackupStatus.AWAITING_CUSTOMER }),
        by,
      );

      const statusSets = (sosModel.updateOne as jest.Mock).mock.calls.filter(
        c => c[1]?.$set?.status,
      );
      expect(statusSets.length).toBeGreaterThanOrEqual(1);
      expect(statusSets[0][1].$set.status).toBe(expectedStatus);
      expect(statusSets[0][0].status.$in).toEqual(
        expect.arrayContaining([SosBackupStatus.AWAITING_CUSTOMER, SosBackupStatus.PENDING]),
      );
    },
  );
});

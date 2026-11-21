import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JobsService } from './jobs.service';
import { Job, Quote, Contract } from './schemas/job.schema';
import { Service } from '../services/schemas/service.schema';
import { HelperProfile } from '../helpers/schemas/helper-profile.schema';
import { HelperPenaltyEvent } from '../helpers/schemas/helper-penalty-event.schema';
import { User } from '../users/schemas/user.schema';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '../chat/chat.service';
import { PaymentsService } from '../payments/payments.service';
import { RoutingService } from './routing.service';
import { FavoritesService } from '../favorites/favorites.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { DisputesService } from './disputes.service';
import { JobStatus, PaymentStatus } from '@homemate/types';
import { Types } from 'mongoose';

/**
 * R12 — PHANTOM SETTLEMENT (item 1) + DISPUTE DEADLOCK (item 2) + CASH GATE
 * (item 20, phía server).
 *
 * Item 1: release_to_helper trên đơn UNPAID (chưa thu tiền, không có escrow)
 * vẫn thành công — đơn lật UNPAID → PAID, biên lai ghi "ĐÃ QUYẾT TOÁN
 * ESCROW" dù không có đồng nào di chuyển (live 2026-11-16, job ...7453).
 * Sau sửa: chặn khi không có tiền để giải ngân (netPaid = 0 và thợ chưa xác
 * nhận tiền mặt); đơn tiền mặt đã xác nhận (kể cả payment_method chưa kịp
 * ghi 'cash') thì đi nhánh khấu trừ hoa hồng, không giải ngân escrow.
 *
 * Item 2: tranh chấp mở trên đơn tiền mặt chưa xác nhận thì kẹt vĩnh viễn —
 * nút xác nhận tiền mặt biến mất khi đơn rời PENDING_REVIEW, cả 3 hướng
 * phân xử đều bị chặn, form admin không có nút bác độc lập. Sau sửa:
 * thợ xác nhận được tiền mặt khi đơn đang tranh chấp mở từ bước 7, và admin
 * có hành động 'reject_dispute' đưa đơn trở lại đúng bước trước tranh chấp
 * mà không di chuyển tiền.
 *
 * Item 20: ở bước 7 chỉ chấp nhận tiền mặt ĐÃ GHI NHẬN (payment_method
 * 'cash') — nút cũ hiện cả cho đơn chưa chọn phương thức nên thợ thấy nút
 * trên cả đơn khách định trả VietQR/ví.
 *
 * FAILS on base 582d57b: (1) release trên đơn UNPAID thành công; (2) release
 * trên đơn cash-đã-xác-nhận-chưa-ghi-phương-thức không khấu trừ hoa hồng;
 * (3) reject_dispute bị coi như release (đơn COMPLETED + PAID);
 * (4) confirmCashPayment trên đơn DISPUTED bị chặn; (5) confirmCashPayment
 * trên đơn PENDING_REVIEW chưa chọn phương thức vẫn thành công.
 */
describe('JobsService.resolveDispute / confirmCashPayment — R12 items 1, 2, 20', () => {
  let service: JobsService;
  let jobModel: any;
  let contractModel: any;
  let contractDoc: any;
  let notificationsService: any;
  let paymentsService: any;
  let deductCashCommission: jest.SpyInstance;
  let releasePayoutForJob: jest.SpyInstance;
  let lastJobDoc: any = null;

  const adminId = new Types.ObjectId().toString();
  const customerId = new Types.ObjectId().toString();
  const helperId = new Types.ObjectId().toString();
  const jobId = new Types.ObjectId().toString();

  function mockJob(opts: {
    paymentStatus?: PaymentStatus;
    paymentMethod?: string | undefined;
    cashConfirmed?: boolean | undefined;
    isWarranty?: boolean;
    events?: { status: string }[];
    totalPaid?: number;
  }): any {
    const doc = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      helper_id: new Types.ObjectId(helperId),
      status: JobStatus.DISPUTED,
      payment_status: opts.paymentStatus ?? PaymentStatus.UNPAID,
      // 'paymentMethod' truyền undefined tường minh = đơn chưa chọn phương thức.
      payment_method: 'paymentMethod' in opts ? opts.paymentMethod : 'vietqr',
      helper_cash_confirmed: opts.cashConfirmed,
      is_warranty: opts.isWarranty ?? false,
      fixed_price: 50_000,
      title: 'Dọn nhà',
      events: opts.events ?? [],
      dispute_resolution: undefined,
      save: jest.fn().mockResolvedValue(true),
    };
    lastJobDoc = doc;
    return doc;
  }

  function mockContract() {
    // Trạng thái 'disputed' như openDispute đã đặt khi mở tranh chấp.
    return {
      total_price: 50_000,
      helper_receives: 42_500,
      platform_fee: 7_500,
      status: 'disputed',
      completed_at: undefined,
      save: jest.fn().mockResolvedValue(true),
    };
  }

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockImplementation((filter: any, update: any) => ({
        exec: jest.fn().mockImplementation(async () => {
          if (lastJobDoc && (filter?.status === JobStatus.DISPUTED || filter?._id)) {
            if (update?.$set) Object.assign(lastJobDoc, update.$set);
            return lastJobDoc;
          }
          return null;
        }),
      })),
    };

    contractDoc = mockContract();
    contractModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(contractDoc),
      }),
    };

    notificationsService = { create: jest.fn().mockResolvedValue({}) };

    paymentsService = {
      refundCustomer: jest.fn().mockResolvedValue({}),
      runMoneyTransaction: jest.fn(async (fn: (s: any) => Promise<any>) => fn(undefined)),
      creditHelper: jest.fn().mockResolvedValue({}),
      creditHelperSimulated: jest.fn().mockResolvedValue({}),
      deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
      hasVerifiedWalletPayment: jest.fn().mockResolvedValue(false),
      hasSimulatedOnlinePayment: jest.fn().mockResolvedValue(true),
      getTotalPaidForJob: jest.fn().mockResolvedValue(0),
    };

    const helperModel = {
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getModelToken(Job.name), useValue: jobModel },
        {
          provide: getModelToken(Quote.name),
          useValue: { updateMany: jest.fn().mockReturnValue({ exec: jest.fn() }) },
        },
        { provide: getModelToken(Contract.name), useValue: contractModel },
        {
          provide: getModelToken(Service.name),
          useValue: {
            findById: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                lean: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue({ platform_fee_percent: 15 }),
                }),
              }),
            }),
          },
        },
        { provide: getModelToken(HelperProfile.name), useValue: helperModel },
        { provide: getModelToken(HelperPenaltyEvent.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        {
          provide: AppGateway,
          useValue: {
            emitToJob: jest.fn(),
            emitToUser: jest.fn(),
            emitToAdmins: jest.fn(),
            broadcastHelperStatus: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ChatService, useValue: {} },
        {
          provide: PaymentsService,
          useValue: paymentsService,
        },
        { provide: RoutingService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: VouchersService, useValue: { restoreForJob: jest.fn() } },
        { provide: LoyaltyService, useValue: { reverseRedeemForJob: jest.fn() } },
        {
          provide: DisputesService,
          useValue: { recordResolution: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    deductCashCommission = jest
      .spyOn(service as any, 'deductCashCommission')
      .mockResolvedValue(undefined);
    releasePayoutForJob = jest.spyOn(service as any, 'releasePayoutForJob').mockResolvedValue(true);
    jest.spyOn(service as any, 'setHelperBusy').mockResolvedValue(undefined);
  });

  // ─── Item 1: PHANTOM SETTLEMENT ───────────────────────────────────────────

  it('item 1: release_to_helper trên đơn UNPAID chưa thu tiền → chặn, đơn ở yên DISPUTED, không phát hành quyết toán', async () => {
    const job = mockJob({ paymentStatus: PaymentStatus.UNPAID, paymentMethod: 'vietqr' });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    await expect(
      service.resolveDispute(adminId, true, jobId, {
        action: 'release_to_helper',
        admin_note: 'Bác khiếu nại',
      } as never),
    ).rejects.toThrow('chưa có khoản thanh toán');

    expect(job.status).toBe(JobStatus.DISPUTED);
    expect(job.payment_status).toBe(PaymentStatus.UNPAID);
    expect(job.save).not.toHaveBeenCalled();
    expect(deductCashCommission).not.toHaveBeenCalled();
    expect(releasePayoutForJob).not.toHaveBeenCalled();
  });

  it('item 1: release_to_helper trên đơn cash ĐÃ xác nhận nhưng chưa ghi phương thức → hoàn tất, khấu trừ hoa hồng (không giải ngân escrow)', async () => {
    const job = mockJob({
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: undefined,
      cashConfirmed: true,
    });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'release_to_helper',
      admin_note: 'Bác khiếu nại',
    } as never);

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(deductCashCommission).toHaveBeenCalledTimes(1);
    expect(releasePayoutForJob).not.toHaveBeenCalled();
  });

  it('item 1 (đối chứng): release_to_helper trên đơn online ĐÃ thu tiền → hoàn tất, giải ngân escrow', async () => {
    (paymentsService.getTotalPaidForJob as jest.Mock).mockResolvedValue(50_000);
    const job = mockJob({ paymentStatus: PaymentStatus.PAID, paymentMethod: 'vietqr' });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'release_to_helper',
      admin_note: 'Bác khiếu nại',
    } as never);

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(releasePayoutForJob).toHaveBeenCalledTimes(1);
    expect(deductCashCommission).not.toHaveBeenCalled();
  });

  it('item 1: release_to_helper trên đơn bảo hành chưa thu tiền → được miễn (không có tiền để chặn)', async () => {
    const job = mockJob({
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: undefined,
      isWarranty: true,
    });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });
    // Đơn bảo hành miễn phí: helper_receives = 0 nên không có khoản giải ngân nào.
    contractDoc.helper_receives = 0;

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'release_to_helper',
      admin_note: 'Bác khiếu nại',
    } as never);

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(deductCashCommission).not.toHaveBeenCalled();
    expect(releasePayoutForJob).not.toHaveBeenCalled();
  });

  // ─── Item 2: DISPUTE DEADLOCK — reject_dispute ────────────────────────────

  it('item 2: reject_dispute trên đơn tranh chấp mở từ bước 7 → đơn về PENDING_REVIEW, không di chuyển tiền', async () => {
    const job = mockJob({
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: undefined,
      events: [{ status: 'pending_review' }],
    });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'reject_dispute',
      admin_note: 'Khiếu nại không có cơ sở',
    } as never);

    expect(result.status).toBe(JobStatus.PENDING_REVIEW);
    expect(result.payment_status).toBe(PaymentStatus.UNPAID);
    expect(result.dispute_resolution?.action).toBe('reject_dispute');
    expect(result.dispute_resolution?.refund_amount).toBe(0);
    expect(result.dispute_resolution?.helper_payout).toBe(0);
    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    expect(deductCashCommission).not.toHaveBeenCalled();
    expect(releasePayoutForJob).not.toHaveBeenCalled();
    // Hợp đồng về ACTIVE (đơn về bước 7), không bị chốt COMPLETED.
    expect(contractDoc.status).toBe('active');
    expect(contractDoc.save).toHaveBeenCalled();
  });

  it('item 2 (C1 review): reject_dispute trên đơn tranh chấp mở giữa lúc đang làm → đơn về IN_PROGRESS, không di chuyển tiền', async () => {
    const job = mockJob({
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: undefined,
      events: [{ status: 'in_progress' }],
    });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'reject_dispute',
      admin_note: 'Khiếu nại không có cơ sở',
    } as never);

    expect(result.status).toBe(JobStatus.IN_PROGRESS);
    expect(result.payment_status).toBe(PaymentStatus.UNPAID);
    expect(result.dispute_resolution?.action).toBe('reject_dispute');
    expect(result.dispute_resolution?.refund_amount).toBe(0);
    expect(result.dispute_resolution?.helper_payout).toBe(0);
    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    expect(deductCashCommission).not.toHaveBeenCalled();
    expect(releasePayoutForJob).not.toHaveBeenCalled();
    // Hợp đồng về ACTIVE (đơn đang làm dở), không bị chốt COMPLETED.
    expect(contractDoc.status).toBe('active');
    expect(contractDoc.save).toHaveBeenCalled();
  });

  it('item 2: reject_dispute trên đơn tranh chấp mở sau nghiệm thu → đơn về COMPLETED, không di chuyển tiền', async () => {
    const job = mockJob({
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'vietqr',
      events: [{ status: 'completed' }],
    });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'reject_dispute',
      admin_note: 'Khiếu nại không có cơ sở',
    } as never);

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(result.payment_status).toBe(PaymentStatus.PAID);
    expect(result.dispute_resolution?.action).toBe('reject_dispute');
    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    expect(deductCashCommission).not.toHaveBeenCalled();
    expect(releasePayoutForJob).not.toHaveBeenCalled();
    // Hợp đồng về COMPLETED (đơn đã nghiệm thu trước tranh chấp).
    expect(contractDoc.status).toBe('completed');
  });

  // ─── Item 2 + 20: confirmCashPayment ──────────────────────────────────────

  function mockConfirmJob(status: JobStatus, opts: Record<string, unknown> = {}): any {
    return {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      helper_id: new Types.ObjectId(helperId),
      status,
      payment_method: 'paymentMethod' in opts ? opts.paymentMethod : 'cash',
      payment_status: 'paymentStatus' in opts ? opts.paymentStatus : PaymentStatus.UNPAID,
      helper_cash_confirmed: false,
      helper_cash_confirmed_at: undefined,
      events: (opts.events as any[]) ?? [],
      save: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('item 2: xác nhận tiền mặt trên đơn DISPUTED mở từ bước 7 → thành công, set cờ', async () => {
    const job = mockConfirmJob(JobStatus.DISPUTED, { paymentMethod: undefined });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    const result = await service.confirmCashPayment(helperId, jobId);

    expect(result.helper_cash_confirmed).toBe(true);
    expect(job.save).toHaveBeenCalledTimes(1);
  });

  it('item 2: xác nhận tiền mặt trên đơn DISPUTED mở sau nghiệm thu → chặn (tiền đã quyết toán)', async () => {
    const job = mockConfirmJob(JobStatus.DISPUTED, {
      paymentMethod: 'cash',
      paymentStatus: PaymentStatus.PAID,
      events: [{ status: 'completed' }],
    });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    await expect(service.confirmCashPayment(helperId, jobId)).rejects.toThrow(
      'không cần xác nhận nhận tiền mặt nữa',
    );

    expect(job.helper_cash_confirmed).toBe(false);
    expect(job.save).not.toHaveBeenCalled();
  });

  it('item 2: xác nhận tiền mặt trên đơn DISPUTED dùng phương thức online → chặn', async () => {
    const job = mockConfirmJob(JobStatus.DISPUTED, {
      paymentMethod: 'vietqr',
      paymentStatus: PaymentStatus.PAID,
    });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    await expect(service.confirmCashPayment(helperId, jobId)).rejects.toThrow(
      'thanh toán bằng tiền mặt',
    );

    expect(job.helper_cash_confirmed).toBe(false);
  });

  it('item 20: xác nhận tiền mặt ở PENDING_REVIEW khi chưa chọn phương thức → chặn (chỉ tiền mặt đã ghi nhận)', async () => {
    const job = mockConfirmJob(JobStatus.PENDING_REVIEW, { paymentMethod: undefined });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    await expect(service.confirmCashPayment(helperId, jobId)).rejects.toThrow(
      'thanh toán bằng tiền mặt',
    );

    expect(job.helper_cash_confirmed).toBe(false);
    expect(job.save).not.toHaveBeenCalled();
  });

  it('item 20 (đối chứng): xác nhận tiền mặt ở PENDING_REVIEW với payment_method cash → thành công', async () => {
    const job = mockConfirmJob(JobStatus.PENDING_REVIEW, { paymentMethod: 'cash' });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });

    const result = await service.confirmCashPayment(helperId, jobId);

    expect(result.helper_cash_confirmed).toBe(true);
    expect(job.save).toHaveBeenCalledTimes(1);
  });
});

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
 * M1 (R11): phân xử tranh chấp KHÔNG được hoàn tất đơn tiền mặt khi thợ chưa
 * xác nhận đã nhận tiền mặt — cùng gate P0-4/R10 như approveCompletion.
 * Trước R11, release_to_helper trên đơn cash ở PENDING_REVIEW (tranh chấp mở
 * được từ PENDING_REVIEW) đưa đơn về COMPLETED + khấu trừ hoa hồng tiền mặt
 * như thể thợ đã nhận tiền, dù thợ chưa bao giờ bấm xác nhận. refund_partial
 * cũng được chặn cùng gate (phòng khi rào "không hoàn tiền điện tử" bị nới).
 */
describe('JobsService.resolveDispute — cash gate (M1/R11)', () => {
  let service: JobsService;
  let jobModel: any;
  let notificationsService: any;
  let paymentsService: any;
  let deductCashCommission: jest.SpyInstance;

  const adminId = new Types.ObjectId().toString();
  const customerId = new Types.ObjectId().toString();
  const helperId = new Types.ObjectId().toString();
  const jobId = new Types.ObjectId().toString();

  function mockCashJob(
    confirmed: boolean | undefined,
    method = 'cash',
    disputeResolution?: Record<string, unknown>,
  ): any {
    return {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      helper_id: new Types.ObjectId(helperId),
      status: JobStatus.DISPUTED,
      payment_status: PaymentStatus.PAID,
      payment_method: method,
      helper_cash_confirmed: confirmed,
      is_warranty: false,
      fixed_price: 350_000,
      title: 'Dọn nhà',
      events: [],
      dispute_resolution: disputeResolution,
      save: jest.fn().mockResolvedValue(true),
    };
  }

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };

    notificationsService = { create: jest.fn().mockResolvedValue({}) };

    paymentsService = {
      refundCustomer: jest.fn().mockResolvedValue({}),
      runMoneyTransaction: jest.fn(async (fn: (s: any) => Promise<any>) => fn(undefined)),
      creditHelper: jest.fn().mockResolvedValue({}),
      deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
      hasVerifiedWalletPayment: jest.fn().mockResolvedValue(true),
      // L3: thực thu của đơn (mặc định = net theo hợp đồng 350.000₫).
      getTotalPaidForJob: jest.fn().mockResolvedValue(350_000),
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
        {
          provide: getModelToken(Contract.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                total_price: 350_000,
                helper_receives: 297_500,
                platform_fee: 52_500,
                status: 'active',
                save: jest.fn().mockResolvedValue(true),
              }),
            }),
          },
        },
        { provide: getModelToken(Service.name), useValue: {} },
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
    jest.spyOn(service as any, 'setHelperBusy').mockResolvedValue(undefined);
  });

  it('release_to_helper trên đơn cash chưa xác nhận → chặn, đơn ở yên DISPUTED, không khấu trừ hoa hồng', async () => {
    const mockJob = mockCashJob(undefined);
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) });

    await expect(
      service.resolveDispute(adminId, true, jobId, {
        action: 'release_to_helper',
        admin_note: 'Bác khiếu nại',
      } as never),
    ).rejects.toThrow('Thợ chưa xác nhận đã nhận tiền mặt');

    expect(mockJob.status).toBe(JobStatus.DISPUTED);
    expect(deductCashCommission).not.toHaveBeenCalled();
  });

  it('refund_partial trên đơn cash chưa xác nhận → chặn bằng lỗi xác nhận tiền mặt (trước rào hoàn điện tử)', async () => {
    const mockJob = mockCashJob(false);
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) });

    await expect(
      service.resolveDispute(adminId, true, jobId, {
        action: 'refund_partial',
        refund_amount: 100_000,
        admin_note: 'Hoàn một phần',
      } as never),
    ).rejects.toThrow('Thợ chưa xác nhận đã nhận tiền mặt');

    expect(mockJob.status).toBe(JobStatus.DISPUTED);
    expect(deductCashCommission).not.toHaveBeenCalled();
  });

  it('release_to_helper trên đơn cash ĐÃ xác nhận → hoàn tất, khấu trừ hoa hồng tiền mặt', async () => {
    const mockJob = mockCashJob(true);
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'release_to_helper',
      admin_note: 'Bác khiếu nại',
    } as never);

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(deductCashCommission).toHaveBeenCalledTimes(1);
  });

  it('release_to_helper trên đơn online (vietqr) → không bị gate tiền mặt', async () => {
    const mockJob = mockCashJob(undefined, 'vietqr');
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'release_to_helper',
      admin_note: 'Bác khiếu nại',
    } as never);

    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(deductCashCommission).not.toHaveBeenCalled();
  });

  it('phân xử LẦN 2 trên đơn cash chưa xác nhận → gate không áp (không di chuyển tiền, chỉ sửa hồ sơ)', async () => {
    const mockJob = mockCashJob(undefined, 'cash', {
      action: 'refund_partial',
      refund_amount: 50_000,
      resolved_at: new Date(),
    });
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'release_to_helper',
      admin_note: 'Sửa phán quyết sau kháng cáo',
    } as never);

    expect(result.status).toBe(JobStatus.COMPLETED);
    // Lần 2 không khấu trừ hoa hồng lần nữa.
    expect(deductCashCommission).not.toHaveBeenCalled();
  });

  it('L3: refund_full chỉ hoàn đúng số thực thu (300.000₫), không hoàn net theo hợp đồng (350.000₫)', async () => {
    (paymentsService.getTotalPaidForJob as jest.Mock).mockResolvedValue(300_000);
    const mockJob = mockCashJob(undefined, 'vietqr');
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) });

    const result = await service.resolveDispute(adminId, true, jobId, {
      action: 'refund_full',
      admin_note: 'Hoàn toàn bộ',
    } as never);

    expect(result.status).toBe(JobStatus.REFUNDED);
    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      String(customerId),
      jobId,
      300_000,
      expect.any(String),
    );
  });
});

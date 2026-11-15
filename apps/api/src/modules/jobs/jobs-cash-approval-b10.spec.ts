/**
 * B10 (R10): Cash-approval bypass — recorded cash tx must NOT stand in for
 * the helper's confirmation.
 *
 * LIVE 2026-11-15 ~08:35: TEST B5b (job 6af7c86c955491e7758bd607) reached
 * step 8 on CASH although the helper NEVER tapped "Xác nhận đã nhận tiền
 * mặt" (POST /jobs/:id/confirm-cash).
 *
 * Root cause: POST /payments/pay method='cash' (mockPayJob) writes a
 * transaction with metadata.cash_paid_in_hand: true, status 'success'
 * (payments.service.ts ~617), and the approveCompletion P0-4 gate
 * (jobs.service.ts:4141-4146) passed when helper_cash_confirmed === true
 * OR hasRecordedCashPayment(jobId) was true. hasRecordedCashPayment only
 * checks for that very transaction — so the customer's own cash-pay tap
 * created the record that satisfied the gate. The helper's confirmation
 * was never actually required. The admin manual-completion gate
 * (admin.service.ts ~734) had the identical OR branch.
 *
 * Fix: both gates require helper_cash_confirmed === true ONLY; the
 * recorded-cash-transaction branch is removed, hasRecordedCashPayment is
 * deleted (it existed solely to serve the bypass), and the dead
 * dto.cash_received branch in completeByHelper (no client ever sent it)
 * is removed so it cannot set the flag either.
 *
 * Pattern: mocked models + mocked paymentsService, as in p0-fixes.spec.ts
 * (P0-4 block). The mocked hasRecordedCashPayment resolving TRUE stands
 * in for the cash transaction mockPayJob records — the gate only ever
 * consulted that seam. All four tests FAIL on base (5684c45) and PASS
 * after the fix.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
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
import { AdminService } from '../admin/admin.service';
import { JobStatus, PaymentStatus } from '@homemate/types';

const CASH_NOT_CONFIRMED_MSG =
  'Thợ chưa xác nhận đã nhận tiền mặt từ khách. Vui lòng yêu cầu thợ bấm xác nhận đã nhận tiền mặt trước khi nghiệm thu đơn tiền mặt.';
const ADMIN_CASH_NOT_CONFIRMED_MSG =
  'Thợ chưa xác nhận đã nhận tiền mặt từ khách. Không thể hoàn thành đơn tiền mặt.';

describe('B10 (R10): Cash approval requires the helper confirmation, not a recorded cash tx', () => {
  let jobsService: JobsService;
  let jobModel: any;
  let quoteModel: any;
  let helperModel: any;
  let contractModel: any;
  let gateway: any;
  let notificationsService: any;
  let paymentsServiceMock: any;
  let loyaltyService: any;

  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const adminId = new Types.ObjectId();

  /** Mutable job doc shared by the findById mock, so confirmCashPayment's
   *  mutation of helper_cash_confirmed is visible to approveCompletion —
   *  exactly like the live flow (confirm → approve on the same job). */
  let jobDoc: any;

  function freshJobDoc(overrides: Record<string, any> = {}) {
    jobDoc = {
      _id: jobId,
      customer_id: customerId,
      helper_id: helperId,
      title: 'TEST B10',
      status: JobStatus.PENDING_REVIEW,
      payment_method: 'cash',
      payment_status: PaymentStatus.UNPAID,
      helper_cash_confirmed: false,
      helper_cash_confirmed_at: undefined,
      completion_photos: ['photo1.jpg'],
      is_warranty: false,
      events: [],
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    return jobDoc;
  }

  function mockContract() {
    return {
      _id: new Types.ObjectId(),
      total_price: 500_000,
      platform_fee: 75_000,
      helper_receives: 425_000,
      status: 'active',
      save: jest.fn().mockResolvedValue({}),
    };
  }

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: jobId,
          helper_id: helperId,
          customer_id: customerId,
          title: 'TEST B10',
          status: JobStatus.COMPLETED,
          payment_status: PaymentStatus.PAID,
          review_reminder_sent: true,
        }),
      }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };
    quoteModel = {
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      create: jest.fn(),
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };
    helperModel = {
      findOne: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    contractModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockContract()) }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    gateway = {
      emitToUser: jest.fn(),
      emitToJob: jest.fn(),
      emitToAdmins: jest.fn(),
      broadcastHelperStatus: jest.fn().mockResolvedValue(undefined),
    };
    notificationsService = {
      notifyNewQuote: jest.fn().mockResolvedValue({}),
      notifyJobCompleted: jest.fn().mockResolvedValue({}),
      notifyAdmins: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };
    // The recorded cash transaction mockPayJob writes for a cash payment
    // (metadata.cash_paid_in_hand: true, status 'success') makes this
    // resolve TRUE — on base that alone opens the P0-4 gate (the bypass).
    paymentsServiceMock = {
      hasRecordedCashPayment: jest.fn().mockResolvedValue(true),
      hasVerifiedWalletPayment: jest.fn().mockResolvedValue(false),
      hasSimulatedOnlinePayment: jest.fn().mockResolvedValue(false),
      getTotalPaidForJob: jest.fn().mockResolvedValue(0),
      deductCashCommission: jest.fn().mockResolvedValue({}),
      deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
      creditHelper: jest.fn().mockResolvedValue({}),
      creditWallet: jest.fn().mockResolvedValue({}),
    };
    loyaltyService = { awardForJob: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getModelToken(Job.name), useValue: jobModel },
        { provide: getModelToken(Quote.name), useValue: quoteModel },
        { provide: getModelToken(Contract.name), useValue: contractModel },
        { provide: getModelToken(Service.name), useValue: {} },
        { provide: getModelToken(HelperProfile.name), useValue: helperModel },
        { provide: getModelToken(HelperPenaltyEvent.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: AppGateway, useValue: gateway },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ChatService, useValue: {} },
        { provide: PaymentsService, useValue: paymentsServiceMock },
        { provide: RoutingService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: VouchersService, useValue: {} },
        { provide: LoyaltyService, useValue: loyaltyService },
        { provide: DisputesService, useValue: {} },
      ],
    }).compile();

    jobsService = module.get<JobsService>(JobsService);
    jest.spyOn(jobsService as any, 'deductCashCommission').mockResolvedValue(undefined);
    jobModel.findById.mockImplementation(() => ({
      exec: jest.fn().mockResolvedValue(jobDoc),
    }));
  });

  it('B10-1: khách đã trả tiền mặt (cash tx đã ghi nhận) nhưng thợ CHƯA xác nhận -> nghiệm thu bị chặn, đúng message cũ', async () => {
    freshJobDoc(); // PENDING_REVIEW, ≥1 photo, cash, helper_cash_confirmed=false
    // Live shape of TEST B5b: customer paid cash first (tx exists), helper
    // never tapped confirm-cash.

    await expect(
      jobsService.approveCompletion(customerId.toString(), jobId.toString(), {
        rating: 5,
        review: 'Tốt',
      } as any),
    ).rejects.toThrow(CASH_NOT_CONFIRMED_MSG);

    // The recorded-cash branch must no longer be consulted at all: the
    // gate is helper_cash_confirmed ONLY.
    expect(paymentsServiceMock.hasRecordedCashPayment).not.toHaveBeenCalled();
    // No atomic claim to COMPLETED happened.
    expect(jobModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect((jobsService as any).deductCashCommission).not.toHaveBeenCalled();
  });

  it('B10-2: thợ bấm xác nhận nhận tiền mặt (confirmCashPayment) -> nghiệm thu thành công, COMPLETED + PAID, trừ hoa hồng tiền mặt', async () => {
    freshJobDoc();

    const confirmed = await jobsService.confirmCashPayment(helperId.toString(), jobId.toString());
    expect(confirmed.helper_cash_confirmed).toBe(true);
    expect(jobDoc.helper_cash_confirmed).toBe(true);

    const res = await jobsService.approveCompletion(customerId.toString(), jobId.toString(), {
      rating: 5,
      review: 'Tốt',
    } as any);

    expect(res.status).toBe(JobStatus.COMPLETED);
    expect(res.payment_status).toBe(PaymentStatus.PAID);
    expect((jobsService as any).deductCashCommission).toHaveBeenCalled();
  });

  it('B10-3 (admin): đơn tiền mặt có cash tx đã ghi nhận nhưng thợ CHƯA xác nhận -> admin hoàn thành bị chặn, đúng message cũ', async () => {
    const adminJobModel: any = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: jobId,
          customer_id: customerId,
          helper_id: helperId,
          status: JobStatus.IN_PROGRESS,
          payment_method: 'cash',
          payment_status: PaymentStatus.UNPAID,
          helper_cash_confirmed: false,
          is_warranty: false,
          save: jest.fn(),
        }),
      }),
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: jobId,
          helper_id: helperId,
          customer_id: customerId,
          status: JobStatus.COMPLETED,
          payment_status: PaymentStatus.PAID,
          review_reminder_sent: true,
        }),
      }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const adminContractModel: any = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockContract()) }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const transactionModelAdmin: any = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };

    const adminService = new AdminService(
      {} as any, // userModel
      {} as any, // helperModel
      adminJobModel,
      adminContractModel,
      {} as any, // notificationModel
      {} as any, // walletModel
      transactionModelAdmin,
      {} as any, // withdrawalModel
      { exists: jest.fn().mockResolvedValue(false) } as any, // reviewModel
      {} as any, // customerModel
      {} as any, // sosModel
      {} as any, // penaltyEventModel
      notificationsService,
      paymentsServiceMock, // hasRecordedCashPayment -> true (cash tx exists)
      jobsService,
      quoteModel,
      { findById: jest.fn() } as any, // serviceModel
    );

    await expect(
      adminService.updateJobStatus(
        jobId.toString(),
        JobStatus.COMPLETED,
        'Admin done',
        adminId.toString(),
      ),
    ).rejects.toThrow(ADMIN_CASH_NOT_CONFIRMED_MSG);

    expect(paymentsServiceMock.hasRecordedCashPayment).not.toHaveBeenCalled();
    expect(adminJobModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('B10-4: completeByHelper KHÔNG còn set helper_cash_confirmed qua DTO (nhánh cash_received đã xoá)', async () => {
    freshJobDoc({ status: JobStatus.IN_PROGRESS });

    const res = await jobsService.completeByHelper(helperId.toString(), jobId.toString(), {
      completion_photos: ['photo1.jpg'],
      cash_received: true,
    } as any);

    // Evidence is accepted (status moves to PENDING_REVIEW) but the cash
    // flag is untouched — only confirmCashPayment may set it.
    expect(res.status).toBe(JobStatus.PENDING_REVIEW);
    expect(jobDoc.completion_photos).toEqual(['photo1.jpg']);
    expect(jobDoc.helper_cash_confirmed).toBe(false);
  });
});

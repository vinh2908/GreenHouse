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
import { MonthlyContractsService } from '../monthly-contracts/monthly-contracts.service';
import {
  MonthlyContract,
  MonthlySettlement,
} from '../monthly-contracts/schemas/monthly-contract.schema';
import { AdminService } from '../admin/admin.service';
import { Wallet, Transaction, Withdrawal } from '../payments/schemas/payment.schema';
import { Review } from '../reviews/schemas/review.schema';
import { CustomerProfile } from '../customers/schemas/customer-profile.schema';
import { SosBackupRequest } from '../sos-backup/schemas/sos-backup.schema';
import {
  JobStatus,
  QuoteStatus,
  PaymentStatus,
  VerificationStatus,
  ContractStatus,
  HelperStatus,
} from '@homemate/types';
import { Types } from 'mongoose';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('ĐỢT 1 — P0 Regression & Correctness Specs', () => {
  let jobsService: JobsService;
  let jobModel: any;
  let quoteModel: any;
  let helperModel: any;

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getModelToken(Job.name), useValue: jobModel },
        { provide: getModelToken(Quote.name), useValue: quoteModel },
        { provide: getModelToken(Contract.name), useValue: {} },
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
        { provide: AppGateway, useValue: { emitToUser: jest.fn(), emitToJob: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: {
            notifyNewQuote: jest.fn().mockResolvedValue({}),
            notifyAdmins: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({}),
          },
        },
        { provide: ChatService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        { provide: RoutingService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: VouchersService, useValue: {} },
        { provide: LoyaltyService, useValue: {} },
        { provide: DisputesService, useValue: {} },
      ],
    }).compile();

    jobsService = module.get<JobsService>(JobsService);
  });

  describe('Q0: rejectJob / unrejectJob / withdrawQuote', () => {
    it('rejectJob: chặn nếu helper đã được chỉ định cho đơn', async () => {
      const helperId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          helper_id: new Types.ObjectId(helperId),
          status: JobStatus.OPEN,
        }),
      });

      await expect((jobsService as any).rejectJob(helperId, jobId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejectJob: chuyển quote PENDING sang WITHDRAWN và đồng bộ số quote', async () => {
      const helperId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.RECEIVING_QUOTES,
        }),
      });
      quoteModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      const res = await (jobsService as any).rejectJob(helperId, jobId);
      expect(res.success).toBe(true);
      expect(quoteModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ status: QuoteStatus.PENDING }),
        { $set: { status: QuoteStatus.WITHDRAWN } },
      );
    });

    it('unrejectJob: khôi phục quote WITHDRAWN về PENDING và đồng bộ lại số quote', async () => {
      const helperId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.OPEN,
        }),
      });
      quoteModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      const res = await (jobsService as any).unrejectJob(helperId, jobId);
      expect(res.success).toBe(true);
      expect(quoteModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ status: QuoteStatus.WITHDRAWN }),
        { $set: { status: QuoteStatus.PENDING } },
      );
      expect(jobModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('withdrawQuote: cho phép thợ tự rút báo giá đang PENDING', async () => {
      const helperId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.RECEIVING_QUOTES,
        }),
      });
      const mockQuote = {
        status: QuoteStatus.PENDING,
        save: jest.fn().mockResolvedValue({ status: QuoteStatus.WITHDRAWN }),
      };
      quoteModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockQuote) });
      quoteModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      const res = await (jobsService as any).withdrawQuote(helperId, jobId);
      expect(res.success).toBe(true);
      expect(mockQuote.status).toBe(QuoteStatus.WITHDRAWN);
      expect(mockQuote.save).toHaveBeenCalled();
    });
  });

  describe('Q0: submitQuote tái kích hoạt báo giá WITHDRAWN thay vì dính lỗi duplicate key E11000', () => {
    it('nếu đã có báo giá cũ WITHDRAWN, cập nhật lại thành PENDING với giá mới', async () => {
      const helperId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.OPEN,
          customer_id: new Types.ObjectId(),
          preferred_date: new Date(Date.now() + 86400000),
          preferred_time_start: '09:00',
          preferred_time_end: '11:00',
          estimated_duration: 2,
        }),
      });
      helperModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            verification_status: VerificationStatus.APPROVED,
            status: 'online',
            user_id: { full_name: 'Thợ Giỏi', is_verified: true, status: 'active' },
          }),
        }),
      });
      const withdrawnQuote = {
        status: QuoteStatus.WITHDRAWN,
        labor_cost: 100000,
        materials_cost: 0,
        total_price: 100000,
        save: jest.fn().mockResolvedValue({}),
      };
      quoteModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(withdrawnQuote) });
      quoteModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });
      jest.spyOn(jobsService, 'checkHelperScheduleConflict').mockResolvedValue(undefined as any);

      await jobsService.submitQuote(helperId, jobId, {
        labor_cost: 150000,
        estimated_duration: 2,
      } as any);

      expect(withdrawnQuote.status).toBe(QuoteStatus.PENDING);
      expect(withdrawnQuote.labor_cost).toBe(150000);
      expect(withdrawnQuote.save).toHaveBeenCalled();
      expect(quoteModel.create).not.toHaveBeenCalled();
    });
  });

  describe('P0-1 & F1: Chốt lương tháng (MonthlyContractsService)', () => {
    let monthlyService: MonthlyContractsService;
    let settlementModel: any;
    let paymentsServiceMock: any;
    let notificationsMock: any;
    const contractId = new Types.ObjectId();
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();

    beforeEach(async () => {
      const mockSession = {
        withTransaction: jest.fn().mockImplementation(async (cb: any) => cb()),
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      settlementModel = {
        db: { startSession: jest.fn().mockResolvedValue(mockSession) },
        findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        create: jest
          .fn()
          .mockImplementation(async (docs: any[]) => [
            { ...docs[0], _id: new Types.ObjectId(), settled_at: new Date() },
          ]),
      };
      paymentsServiceMock = {
        getWallet: jest.fn().mockResolvedValue({ balance: 50_000_000 }),
        creditWallet: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
        deductWallet: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      };
      notificationsMock = {
        create: jest.fn().mockResolvedValue({}),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MonthlyContractsService,
          { provide: getModelToken(MonthlyContract.name), useValue: {} },
          { provide: getModelToken('AttendanceRecord'), useValue: {} },
          { provide: getModelToken('LeaveRequest'), useValue: {} },
          { provide: getModelToken(MonthlySettlement.name), useValue: settlementModel },
          { provide: getModelToken(HelperProfile.name), useValue: {} },
          { provide: getModelToken(Service.name), useValue: {} },
          { provide: NotificationsService, useValue: notificationsMock },
          { provide: PaymentsService, useValue: paymentsServiceMock },
          { provide: AppGateway, useValue: { emitToUser: jest.fn(), emitToJob: jest.fn() } },
        ],
      }).compile();

      monthlyService = module.get<MonthlyContractsService>(MonthlyContractsService);
      jest.spyOn(monthlyService as any, 'getContractOrFail').mockResolvedValue({
        _id: contractId,
        customer_id: customerId,
        helper_id: helperId,
        title: 'Giúp việc theo tháng',
        status: 'active',
        platform_fee_percent: 15,
      });
      jest.spyOn(monthlyService as any, 'computeSummary').mockResolvedValue({
        scheduled_days: 20,
        confirmed_days: 20,
        leave_days: 0,
        absent_days: 0,
        gross_amount: 10_000_000,
        platform_fee: 1_500_000,
        helper_receives: 8_500_000,
      });
      jest.spyOn(monthlyService as any, 'todayStr').mockReturnValue('2026-11-08');
    });

    it('P0-1: ví thật không đủ tiền chốt lương -> chặn và ném BadRequestException', async () => {
      paymentsServiceMock.getWallet.mockResolvedValue({ balance: 2_000_000 }); // Cần 10tr nhưng chỉ có 2tr

      await expect(
        monthlyService.settle(customerId.toString(), contractId.toString(), {
          month: '2026-10',
          payment_mode: 'wallet',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(paymentsServiceMock.creditWallet).not.toHaveBeenCalled();
    });

    it('P0-1: ví thật đủ tiền -> trừ ví khách, cộng ví thợ và lưu settlement', async () => {
      paymentsServiceMock.getWallet.mockResolvedValue({ balance: 20_000_000 });

      const res = await monthlyService.settle(customerId.toString(), contractId.toString(), {
        month: '2026-10',
        payment_mode: 'wallet',
      });

      expect(paymentsServiceMock.deductWallet).toHaveBeenCalledWith(
        customerId.toString(),
        10_000_000,
        expect.any(String),
        expect.anything(),
      );
      expect(paymentsServiceMock.creditWallet).toHaveBeenCalledWith(
        helperId.toString(),
        8_500_000,
        expect.any(Object),
        expect.anything(),
      );
      expect(res.helper_receives).toBe(8_500_000);
    });

    it('F1: chế độ cash_direct (trả ngoài hệ thống) -> cộng 0₫ ví thợ, thông báo thợ và khách ghi rõ trả ngoài, response helper_receives = 0', async () => {
      const res = await monthlyService.settle(customerId.toString(), contractId.toString(), {
        month: '2026-10',
        payment_mode: 'cash_direct',
      });

      expect(paymentsServiceMock.deductWallet).not.toHaveBeenCalled();
      expect(paymentsServiceMock.creditWallet).not.toHaveBeenCalled();
      expect(res.helper_receives).toBe(0);
      expect(res.note).toBe('Trả ngoài hệ thống, không cộng ví');

      expect(notificationsMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: helperId.toString(),
          body: expect.stringContaining('trả ngoài hệ thống, không cộng ví (0₫)'),
        }),
      );
      expect(notificationsMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: customerId.toString(),
          body: expect.stringContaining('trả ngoài hệ thống, không trừ ví'),
        }),
      );
    });
  });

  describe('P0-3 & F6: Trả chênh lệch phụ lục & Tính net paid (PaymentsService)', () => {
    let paymentsService: PaymentsService;
    let transactionModel: any;
    let walletModel: any;
    let jobModelPayment: any;
    const jobId = new Types.ObjectId().toString();

    beforeEach(async () => {
      walletModel = {
        findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), balance: 10_000_000 }),
        findOneAndUpdate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ balance: 9_400_000 }),
        }),
      };
      transactionModel = {
        find: jest.fn(),
        findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        create: jest
          .fn()
          .mockImplementation(async (docs: any[]) => [{ ...docs[0], _id: new Types.ObjectId() }]),
      };
      jobModelPayment = {
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
        findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
        updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentsService,
          { provide: getModelToken(Wallet.name), useValue: walletModel },
          { provide: getModelToken(Transaction.name), useValue: transactionModel },
          { provide: getModelToken(Withdrawal.name), useValue: {} },
          { provide: getModelToken(HelperProfile.name), useValue: {} },
          { provide: getModelToken(Job.name), useValue: jobModelPayment },
          { provide: getModelToken(Contract.name), useValue: {} },
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({}) } },
          { provide: VouchersService, useValue: { redeemForJob: jest.fn() } },
          { provide: LoyaltyService, useValue: { redeemAtPayment: jest.fn() } },
        ],
      }).compile();

      paymentsService = module.get<PaymentsService>(PaymentsService);
    });

    it('F6: getTotalPaidForJob trừ tiền đã hoàn: thanh toán 1tr, hoàn 400k -> net paid = 600k', async () => {
      transactionModel.find.mockImplementation((filter: any) => ({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest
              .fn()
              .mockResolvedValue(
                filter.type === 'payment'
                  ? [{ amount: 1_000_000 }]
                  : filter.type === 'refund'
                    ? [{ amount: 400_000 }]
                    : [],
              ),
          }),
        }),
      }));

      const netPaid = await paymentsService.getTotalPaidForJob(jobId);
      expect(netPaid).toBe(600_000);
      expect(jobModelPayment.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        { $set: { paid_amount: 600_000, refunded_amount: 400_000 } },
      );
    });

    it('P0-3 & F6: Đơn hợp đồng 1tr2, net đã trả 600k -> thanh toán phụ lục chỉ thu đúng 600k chênh lệch', async () => {
      const customerId = new Types.ObjectId().toString();
      jest.spyOn(paymentsService, 'getTotalPaidForJob').mockResolvedValue(600_000);
      const mockContract = {
        total_price: 1_200_000,
        platform_fee: 180_000,
        helper_receives: 1_020_000,
      };
      (paymentsService as any).contractModel = {
        findOne: jest.fn().mockReturnValue({
          session: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockContract),
          }),
        }),
      };
      jobModelPayment.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          customer_id: new Types.ObjectId(customerId),
          status: JobStatus.CONFIRMED,
          payment_status: PaymentStatus.UNPAID,
        }),
      });

      const res = await paymentsService.mockPayJob(customerId, jobId, 600_000, 'wallet');

      expect(res.transaction).toBeDefined();
      expect(res.transaction.amount).toBe(600_000);
    });
  });

  describe('P0-4 & P0-5 & F5: Nghiệm thu tiền mặt & Rollback (JobsService)', () => {
    let paymentsServiceMock: any;
    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    beforeEach(() => {
      paymentsServiceMock = {
        hasRecordedCashPayment: jest.fn().mockResolvedValue(false),
        deductCashCommission: jest.fn().mockResolvedValue({}),
        deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
        creditWallet: jest.fn().mockResolvedValue({}),
      };
      (jobsService as any).paymentsService = paymentsServiceMock;
      (jobsService as any).contractModel = {
        findOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            total_price: 500_000,
            platform_fee: 75_000,
            helper_receives: 425_000,
            save: jest.fn().mockResolvedValue({}),
          }),
        }),
      };
    });

    it('P0-4: đơn tiền mặt chưa xác nhận nhận tiền -> chặn nghiệm thu, ném BadRequestException', async () => {
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          customer_id: new Types.ObjectId(customerId),
          status: JobStatus.PENDING_REVIEW,
          payment_method: 'cash',
          helper_cash_confirmed: false,
          completion_photos: ['photo1.jpg'],
        }),
      });

      await expect(
        jobsService.approveCompletion(customerId, jobId, { rating: 5, review: 'Tốt' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('P0-4 & P0-5: đơn tiền mặt đã xác nhận -> nghiệm thu thành công, payment_status=PAID và trừ phí hoa hồng', async () => {
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          customer_id: new Types.ObjectId(customerId),
          helper_id: new Types.ObjectId(),
          status: JobStatus.PENDING_REVIEW,
          payment_method: 'cash',
          helper_cash_confirmed: true,
          completion_photos: ['photo1.jpg'],
        }),
      });
      jobModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          helper_id: new Types.ObjectId(),
          status: JobStatus.COMPLETED,
          payment_status: PaymentStatus.PAID,
        }),
      });
      jest.spyOn(jobsService as any, 'deductCashCommission').mockResolvedValue(undefined);

      const res = await jobsService.approveCompletion(customerId, jobId, {
        rating: 5,
        review: 'Tốt',
      } as any);

      expect(res.status).toBe(JobStatus.COMPLETED);
      expect((jobsService as any).deductCashCommission).toHaveBeenCalled();
    });

    it('F5: giải ngân lỗi -> rollback trạng thái đơn và hợp đồng về trạng thái cũ', async () => {
      const prevStatus = JobStatus.PENDING_REVIEW;
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          customer_id: new Types.ObjectId(customerId),
          helper_id: new Types.ObjectId(),
          status: prevStatus,
          payment_method: 'cash',
          helper_cash_confirmed: true,
          completion_photos: ['photo1.jpg'],
        }),
      });
      jobModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          helper_id: new Types.ObjectId(),
          status: JobStatus.COMPLETED,
        }),
      });
      jest
        .spyOn(jobsService as any, 'deductCashCommission')
        .mockRejectedValue(new Error('Wallet failure'));

      await expect(
        jobsService.approveCompletion(customerId, jobId, { rating: 5, review: 'Tốt' } as any),
      ).rejects.toThrow('Wallet failure');

      expect(jobModel.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        expect.objectContaining({
          $set: expect.objectContaining({ status: prevStatus }),
        }),
      );
    });
  });

  describe('F2 & F3 & R2 & N3: Admin hoàn thành & Hủy đơn (AdminService)', () => {
    let adminService: AdminService;
    let jobModelAdmin: any;
    let contractModelAdmin: any;
    let transactionModelAdmin: any;
    let paymentsServiceMock: any;
    const adminId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    beforeEach(() => {
      jobModelAdmin = {
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      };
      contractModelAdmin = {
        findOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            total_price: 500_000,
            platform_fee: 75_000,
            helper_receives: 425_000,
            save: jest.fn().mockResolvedValue({}),
          }),
        }),
        updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      };
      transactionModelAdmin = {
        findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      };
      paymentsServiceMock = {
        hasRecordedCashPayment: jest.fn().mockResolvedValue(false),
        deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
        creditHelper: jest.fn().mockResolvedValue({}),
        hasSimulatedOnlinePayment: jest.fn().mockResolvedValue(false),
      };

      adminService = new AdminService(
        {} as any, // userModel
        {} as any, // helperModel
        jobModelAdmin,
        contractModelAdmin,
        {} as any, // notificationModel
        {} as any, // walletModel
        transactionModelAdmin,
        {} as any, // withdrawalModel
        { exists: jest.fn().mockResolvedValue(false) } as any, // reviewModel
        {} as any, // customerModel
        {} as any, // sosModel
        {} as any, // penaltyEventModel
        { create: jest.fn().mockResolvedValue({}) } as any, // notificationsService
        paymentsServiceMock,
        jobsService,
        quoteModel,
        { findById: jest.fn() } as any, // serviceModel
      );
    });

    it('F2 & N3: đơn UNPAID (không phải bảo hành) -> admin hoàn thành bị chặn, ném BadRequestException, đơn KHÔNG chuyển COMPLETED', async () => {
      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.IN_PROGRESS,
          payment_method: 'vietqr',
          payment_status: PaymentStatus.UNPAID,
          helper_id: new Types.ObjectId(),
          is_warranty: false,
          save: jest.fn(),
        }),
      });

      await expect(
        adminService.updateJobStatus(jobId, JobStatus.COMPLETED, 'Admin done', adminId),
      ).rejects.toThrow(BadRequestException);

      expect(jobModelAdmin.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('F2: đơn tiền mặt chưa xác nhận -> admin hoàn thành bị chặn trước atomic claim', async () => {
      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.IN_PROGRESS,
          payment_method: 'cash',
          helper_cash_confirmed: false,
          helper_id: new Types.ObjectId(),
          is_warranty: false,
        }),
      });

      await expect(
        adminService.updateJobStatus(jobId, JobStatus.COMPLETED, 'Admin done', adminId),
      ).rejects.toThrow(BadRequestException);

      expect(jobModelAdmin.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('F2: đơn bảo hành UNPAID theo thiết kế -> admin hoàn thành được thành công', async () => {
      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.IN_PROGRESS,
          payment_status: PaymentStatus.UNPAID,
          helper_id: new Types.ObjectId(),
          is_warranty: true,
        }),
      });
      jobModelAdmin.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.COMPLETED,
          helper_id: new Types.ObjectId(),
          is_warranty: true,
        }),
      });

      const res = await adminService.updateJobStatus(
        jobId,
        JobStatus.COMPLETED,
        'Admin done warranty',
        adminId,
      );

      expect(res.status).toBe(JobStatus.COMPLETED);
    });

    it('F3: 2 admin hoàn thành cùng lúc -> claim nguyên tử chặn admin thứ 2 bằng ConflictException', async () => {
      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.IN_PROGRESS,
          payment_status: PaymentStatus.PAID,
          helper_id: new Types.ObjectId(),
        }),
      });
      jobModelAdmin.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null), // Đã bị admin khác claim trước
      });

      await expect(
        adminService.updateJobStatus(jobId, JobStatus.COMPLETED, 'Admin done', adminId),
      ).rejects.toThrow(ConflictException);
    });

    it('F3: giải ngân lỗi -> đơn rollback về trạng thái cũ, không kẹt COMPLETED chưa có tiền', async () => {
      const prevStatus = JobStatus.IN_PROGRESS;
      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: prevStatus,
          payment_status: PaymentStatus.PAID,
          helper_id: new Types.ObjectId(),
        }),
      });
      jobModelAdmin.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.COMPLETED,
          payment_status: PaymentStatus.PAID,
          helper_id: new Types.ObjectId(),
        }),
      });
      paymentsServiceMock.creditHelper.mockRejectedValue(new Error('Gateway down'));

      await expect(
        adminService.updateJobStatus(jobId, JobStatus.COMPLETED, 'Admin done', adminId),
      ).rejects.toThrow('Gateway down');

      expect(jobModelAdmin.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        expect.objectContaining({
          $set: expect.objectContaining({ status: prevStatus }),
        }),
      );
    });

    it('R2: admin hủy đơn chưa trả (UNPAID) -> giữ UNPAID, không chuyển sang REFUNDED', async () => {
      const mockJob = {
        _id: new Types.ObjectId(jobId),
        status: JobStatus.OPEN,
        payment_status: PaymentStatus.UNPAID,
        events: [] as any[],
        save: jest.fn().mockResolvedValue({}),
      };
      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockJob),
      });

      const res = await adminService.updateJobStatus(
        jobId,
        JobStatus.CANCELLED,
        'Admin hủy',
        adminId,
      );

      expect(res.status).toBe(JobStatus.CANCELLED);
      expect(mockJob.payment_status).toBe(PaymentStatus.UNPAID); // Giữ nguyên UNPAID
    });

    it('I1 & L1 & L2: giải ngân lỗi -> hợp đồng và đơn đều rollback về đúng status và $unset completed_at khi gốc là undefined', async () => {
      const prevStatus = JobStatus.IN_PROGRESS;
      const prevContractStatus = ContractStatus.ACTIVE;
      const prevCompletedAt = undefined;
      const contractId = new Types.ObjectId();
      const mockContract = {
        _id: contractId,
        status: prevContractStatus,
        completed_at: prevCompletedAt,
        total_price: 500_000,
        platform_fee: 75_000,
        helper_receives: 425_000,
        save: jest.fn().mockResolvedValue({}),
      };
      contractModelAdmin.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockContract),
      });

      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: prevStatus,
          payment_status: PaymentStatus.PAID,
          helper_id: new Types.ObjectId(),
          completed_at: undefined,
        }),
      });
      jobModelAdmin.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.COMPLETED,
          payment_status: PaymentStatus.PAID,
          helper_id: new Types.ObjectId(),
        }),
      });
      paymentsServiceMock.creditHelper.mockRejectedValue(new Error('Gateway down'));

      await expect(
        adminService.updateJobStatus(jobId, JobStatus.COMPLETED, 'Admin done', adminId),
      ).rejects.toThrow('Gateway down');

      expect(jobModelAdmin.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        expect.objectContaining({
          $set: expect.objectContaining({ status: prevStatus }),
          $unset: { completed_at: '' },
        }),
      );

      expect(contractModelAdmin.updateOne).toHaveBeenCalledWith(
        { _id: contractId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: prevContractStatus,
          }),
          $unset: { completed_at: '' },
        }),
      );
    });

    it('L1 & L2: giải ngân lỗi -> khi đơn và hợp đồng đã có completed_at gốc thì rollback $set khôi phục đúng giá trị', async () => {
      const prevStatus = JobStatus.IN_PROGRESS;
      const prevContractStatus = ContractStatus.ACTIVE;
      const prevCompletedAt = new Date('2026-11-01T08:00:00Z');
      const contractId = new Types.ObjectId();
      const mockContract = {
        _id: contractId,
        status: prevContractStatus,
        completed_at: prevCompletedAt,
        total_price: 500_000,
        platform_fee: 75_000,
        helper_receives: 425_000,
        save: jest.fn().mockResolvedValue({}),
      };
      contractModelAdmin.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockContract),
      });

      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: prevStatus,
          payment_status: PaymentStatus.PAID,
          helper_id: new Types.ObjectId(),
          completed_at: prevCompletedAt,
        }),
      });
      jobModelAdmin.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.COMPLETED,
          payment_status: PaymentStatus.PAID,
          helper_id: new Types.ObjectId(),
        }),
      });
      paymentsServiceMock.creditHelper.mockRejectedValue(new Error('Gateway down'));

      await expect(
        adminService.updateJobStatus(jobId, JobStatus.COMPLETED, 'Admin done', adminId),
      ).rejects.toThrow('Gateway down');

      expect(jobModelAdmin.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        expect.objectContaining({
          $set: expect.objectContaining({ status: prevStatus, completed_at: prevCompletedAt }),
        }),
      );

      expect(contractModelAdmin.updateOne).toHaveBeenCalledWith(
        { _id: contractId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: prevContractStatus,
            completed_at: prevCompletedAt,
          }),
        }),
      );
    });

    it('I4: đơn có helper_id nhưng không có hợp đồng (UNPAID hoặc tiền mặt chưa xác nhận) -> admin hoàn thành bị chặn, ném BadRequestException', async () => {
      contractModelAdmin.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null), // Không có hợp đồng
      });
      jobModelAdmin.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.IN_PROGRESS,
          payment_method: 'vietqr',
          payment_status: PaymentStatus.UNPAID,
          helper_id: new Types.ObjectId(),
          is_warranty: false,
        }),
      });

      await expect(
        adminService.updateJobStatus(jobId, JobStatus.COMPLETED, 'Admin done', adminId),
      ).rejects.toThrow(BadRequestException);

      expect(jobModelAdmin.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('F4 & R-B11: Admin gán thợ (AdminService.adminAssignHelper)', () => {
    let adminService: AdminService;
    let jobModelAssign: any;
    let helperModelAssign: any;
    let contractModelAssign: any;
    const adminId = new Types.ObjectId().toString();
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    beforeEach(() => {
      jobModelAssign = {
        findById: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      };
      helperModelAssign = {
        findOne: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              verification_status: VerificationStatus.APPROVED,
              status: HelperStatus.ONLINE,
              user_id: { full_name: 'Thợ Giỏi', is_verified: true, status: 'active' },
            }),
          }),
        }),
      };
      contractModelAssign = {
        create: jest.fn().mockImplementation(async (doc: any) => ({
          ...doc,
          _id: new Types.ObjectId(),
        })),
      };

      adminService = new AdminService(
        {} as any,
        helperModelAssign,
        jobModelAssign,
        contractModelAssign,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { create: jest.fn().mockResolvedValue({}) } as any,
        {} as any,
        jobsService,
        quoteModel,
        { findById: jest.fn() } as any,
      );
      jest.spyOn(jobsService, 'checkHelperScheduleConflict').mockResolvedValue(undefined as any);
      jest.spyOn(jobsService, 'setHelperBusy').mockResolvedValue(undefined as any);
      jest.spyOn(jobsService, 'emitJobStatusChange').mockReturnValue(undefined as any);
    });

    it('F4: đơn chưa có giá hợp lệ -> bị từ chối TRƯỚC atomic claim, đơn vẫn OPEN không thợ', async () => {
      jobModelAssign.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.OPEN,
          target_price: 0,
          is_fixed_price: false,
        }),
      });

      await expect(adminService.adminAssignHelper(jobId, helperId, adminId)).rejects.toThrow(
        BadRequestException,
      );

      expect(jobModelAssign.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('F4: đơn có giá nhưng chưa thanh toán -> gán thợ thành công, đơn ở trạng thái chờ thanh toán (QUOTE_SELECTED, không phải CONFIRMED)', async () => {
      jobModelAssign.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(jobId),
          status: JobStatus.OPEN,
          target_price: 350_000,
          is_fixed_price: false,
          payment_status: PaymentStatus.UNPAID,
          preferred_date: new Date('2026-11-10'),
          preferred_time_start: '09:00',
        }),
      });
      const claimedDoc = {
        _id: new Types.ObjectId(jobId),
        status: JobStatus.QUOTE_SELECTED,
        helper_id: new Types.ObjectId(helperId),
        events: [] as any[],
        save: jest.fn().mockResolvedValue({}),
      };
      jobModelAssign.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(claimedDoc),
      });

      const res = await adminService.adminAssignHelper(jobId, helperId, adminId);

      expect(res.status).toBe(JobStatus.QUOTE_SELECTED);
      expect(jobModelAssign.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ status: JobStatus.QUOTE_SELECTED }),
        }),
        expect.anything(),
      );
      expect(contractModelAssign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          total_price: 350_000,
        }),
      );
    });

    it('I3: đơn kẹt CONFIRMED có helper_id nhưng không có hợp đồng -> chạy repairStuckAssignedJob (unassign) -> đơn về OPEN, helper_id = null và gán thợ lại thành công', async () => {
      // 1. Tạo đơn ở trạng thái kẹt
      const stuckJob = {
        _id: new Types.ObjectId(jobId),
        status: JobStatus.CONFIRMED,
        helper_id: new Types.ObjectId(helperId),
        target_price: 400_000,
        is_fixed_price: false,
        payment_status: PaymentStatus.PAID,
        preferred_date: new Date('2026-11-12'),
        preferred_time_start: '10:00',
        events: [] as any[],
        save: jest.fn().mockResolvedValue({}),
      };

      jobModelAssign.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(stuckJob),
      });
      contractModelAssign.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null), // Chưa có hợp đồng
      });

      // 2. Chạy đường sửa unassign
      const repairedJob = await adminService.repairStuckAssignedJob(jobId, 'unassign', adminId);

      // 3. Assert đơn trở về trạng thái gán lại được (OPEN, helper_id: null)
      expect(repairedJob.status).toBe(JobStatus.OPEN);
      expect(repairedJob.helper_id).toBeNull();
      expect(jobsService.setHelperBusy).toHaveBeenCalledWith(helperId, false);

      // 4. Gán thợ lại thành công
      const claimedDoc = {
        _id: new Types.ObjectId(jobId),
        status: JobStatus.CONFIRMED,
        helper_id: new Types.ObjectId(helperId),
        events: [] as any[],
        save: jest.fn().mockResolvedValue({}),
      };
      jobModelAssign.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(claimedDoc),
      });

      const assignRes = await adminService.adminAssignHelper(jobId, helperId, adminId);
      expect(assignRes.status).toBe(JobStatus.CONFIRMED);
      expect(contractModelAssign.create).toHaveBeenCalled();
    });

    it('I3: đơn kẹt CONFIRMED có helper_id nhưng không có hợp đồng -> chạy repairStuckAssignedJob (backfill) -> tạo hợp đồng bù', async () => {
      const stuckJob = {
        _id: new Types.ObjectId(jobId),
        status: JobStatus.CONFIRMED,
        helper_id: new Types.ObjectId(helperId),
        customer_id: new Types.ObjectId(),
        target_price: 500_000,
        is_fixed_price: false,
        payment_status: PaymentStatus.PAID,
        preferred_date: new Date('2026-11-15'),
        preferred_time_start: '08:00',
        events: [] as any[],
        save: jest.fn().mockResolvedValue({}),
      };

      jobModelAssign.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(stuckJob),
      });
      contractModelAssign.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null), // Chưa có hợp đồng
      });

      const res = await adminService.repairStuckAssignedJob(jobId, 'backfill', adminId);

      expect(res.status).toBe(JobStatus.CONFIRMED);
      expect(contractModelAssign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: stuckJob._id,
          helper_id: stuckJob.helper_id,
          total_price: 500_000,
        }),
      );
    });

    it('L3(a): đơn IN_PROGRESS có helper_id nhưng không có hợp đồng -> gọi repairStuckAssignedJob bị chặn 400', async () => {
      const jobInProgress = {
        _id: new Types.ObjectId(jobId),
        status: JobStatus.IN_PROGRESS,
        helper_id: new Types.ObjectId(helperId),
        customer_id: new Types.ObjectId(),
        target_price: 500_000,
        is_fixed_price: false,
        payment_status: PaymentStatus.PAID,
        events: [] as any[],
        save: jest.fn().mockResolvedValue({}),
      };
      jobModelAssign.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(jobInProgress),
      });
      contractModelAssign.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(adminService.repairStuckAssignedJob(jobId, 'unassign', adminId)).rejects.toThrow(
        'Không thể sửa đơn ở trạng thái "in_progress"',
      );
    });

    it('L3(b): mode không hợp lệ -> ném BadRequestException, không tự ý unassign', async () => {
      const stuckJob = {
        _id: new Types.ObjectId(jobId),
        status: JobStatus.CONFIRMED,
        helper_id: new Types.ObjectId(helperId),
        customer_id: new Types.ObjectId(),
        target_price: 500_000,
        is_fixed_price: false,
        payment_status: PaymentStatus.PAID,
        events: [] as any[],
        save: jest.fn().mockResolvedValue({}),
      };
      jobModelAssign.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(stuckJob),
      });
      contractModelAssign.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        adminService.repairStuckAssignedJob(jobId, 'invalid_mode' as any, adminId),
      ).rejects.toThrow('Chế độ sửa "invalid_mode" không hợp lệ');
    });
  });
});

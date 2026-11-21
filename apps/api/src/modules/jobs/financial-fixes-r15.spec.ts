import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { JobStatus, PaymentStatus, ContractStatus } from '@homemate/types';
import { JobsService } from './jobs.service';
import { Job, Quote, Contract } from './schemas/job.schema';
import { PaymentsService } from '../payments/payments.service';
import { AdminService } from '../admin/admin.service';
import { InvoicesService } from '../invoices/invoices.service';
import { Invoice } from '../invoices/schemas/invoice.schema';
import { Wallet, Transaction, Withdrawal } from '../payments/schemas/payment.schema';
import { Service } from '../services/schemas/service.schema';
import { HelperProfile } from '../helpers/schemas/helper-profile.schema';
import { HelperPenaltyEvent } from '../helpers/schemas/helper-penalty-event.schema';
import { User } from '../users/schemas/user.schema';
import { Notification } from '../notifications/schemas/notification.schema';
import { CustomerProfile } from '../customers/schemas/customer-profile.schema';
import { Review } from '../reviews/schemas/review.schema';
import { SosBackupRequest } from '../sos-backup/schemas/sos-backup.schema';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '../chat/chat.service';
import { RoutingService } from './routing.service';
import { FavoritesService } from '../favorites/favorites.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { DisputesService } from './disputes.service';

describe('R15 Financial Bug Proof Tests (API-M1..M6)', () => {
  describe('API-M1 & API-M2: resolveDispute atomic claim & retryable refund', () => {
    let service: JobsService;
    let jobModel: any;
    let contractModel: any;
    let paymentsService: any;
    let disputesService: any;

    beforeEach(async () => {
      const dbJob: any = {
        _id: new Types.ObjectId(),
        customer_id: new Types.ObjectId(),
        helper_id: new Types.ObjectId(),
        status: JobStatus.DISPUTED,
        payment_status: PaymentStatus.PAID,
        payment_method: 'wallet',
        fixed_price: 50_000,
        events: [],
        save: jest.fn().mockResolvedValue(true),
      };

      jobModel = {
        findById: jest.fn().mockReturnValue({
          exec: jest.fn().mockImplementation(() => Promise.resolve(dbJob)),
        }),
        findOneAndUpdate: jest.fn().mockImplementation((query, update) => {
          if (query.status === JobStatus.DISPUTED) {
            if (dbJob.status !== JobStatus.DISPUTED) {
              return { exec: () => Promise.resolve(null) };
            }
            dbJob.status = update.$set?.status || dbJob.status;
            if (update.$set?.refund_pending_retry !== undefined) {
              dbJob.refund_pending_retry = update.$set.refund_pending_retry;
              dbJob.refund_pending_amount = update.$set.refund_pending_amount;
              dbJob.refund_pending_reason = update.$set.refund_pending_reason;
            }
            return { exec: () => Promise.resolve(dbJob) };
          }
          return { exec: () => Promise.resolve(null) };
        }),
        updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
      };

      contractModel = {
        findOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            total_price: 50_000,
            helper_receives: 40_000,
            status: ContractStatus.ACTIVE,
            save: jest.fn().mockResolvedValue(true),
          }),
        }),
      };

      paymentsService = {
        getTotalPaidForJob: jest.fn().mockResolvedValue(50_000),
        refundCustomer: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
        releasePayoutForJob: jest.fn().mockResolvedValue({}),
      };

      disputesService = {
        recordResolution: jest.fn().mockResolvedValue({}),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          JobsService,
          { provide: getModelToken(Job.name), useValue: jobModel },
          {
            provide: getModelToken(Quote.name),
            useValue: {
              updateMany: jest.fn().mockReturnValue({ exec: jest.fn() }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
                }),
              }),
            },
          },
          { provide: getModelToken(Contract.name), useValue: contractModel },
          {
            provide: getModelToken(Service.name),
            useValue: {
              findById: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
                }),
              }),
            },
          },
          {
            provide: getModelToken(HelperProfile.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
              updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
            },
          },
          { provide: getModelToken(HelperPenaltyEvent.name), useValue: { create: jest.fn() } },
          { provide: getModelToken(User.name), useValue: { findById: jest.fn() } },
          {
            provide: AppGateway,
            useValue: { notifyNewJob: jest.fn(), emitToJob: jest.fn(), emitToUser: jest.fn() },
          },
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({}) } },
          {
            provide: ChatService,
            useValue: { createRoom: jest.fn(), sendSystemMessage: jest.fn() },
          },
          { provide: PaymentsService, useValue: paymentsService },
          { provide: RoutingService, useValue: {} },
          { provide: FavoritesService, useValue: {} },
          { provide: VouchersService, useValue: {} },
          { provide: LoyaltyService, useValue: {} },
          { provide: DisputesService, useValue: disputesService },
        ],
      }).compile();

      service = module.get<JobsService>(JobsService);
    });

    it('API-M1: 2 parallel resolveDispute calls -> only 1 succeeds, second rejected, refund called once', async () => {
      const adminId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      const dto = { action: 'refund_full', admin_note: 'Test double refund' } as any;

      const results = await Promise.allSettled([
        service.resolveDispute(adminId, true, jobId, dto),
        service.resolveDispute(adminId, true, jobId, dto),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    });

    it('API-M2: refund failure preserves retryable state and can be retried', async () => {
      const adminId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      const dto = { action: 'refund_full', admin_note: 'Network glitch' } as any;

      paymentsService.refundCustomer.mockRejectedValueOnce(new Error('Bank connection timeout'));

      // First attempt fails during refundCustomer
      await expect(service.resolveDispute(adminId, true, jobId, dto)).rejects.toThrow();

      // Second attempt (retry) should succeed and complete the refund
      paymentsService.refundCustomer.mockResolvedValueOnce({ _id: new Types.ObjectId() });
      const retried = await service.resolveDispute(adminId, true, jobId, dto);

      expect(retried).toBeDefined();
      expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(2);
      expect(retried.refund_pending_retry).toBeFalsy();
    });
  });

  describe('API-M4: directRefund blocks cash and caps at actual paid', () => {
    let adminService: AdminService;
    let jobModel: any;
    let contractModel: any;
    let transactionModel: any;
    let paymentsService: any;

    beforeEach(async () => {
      jobModel = {
        findById: jest.fn(),
        updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
        findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      };
      contractModel = {
        findOne: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue({ total_price: 100_000 }) }),
      };
      transactionModel = {
        find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      };
      paymentsService = {
        getTotalPaidForJob: jest.fn(),
        refundCustomer: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AdminService,
          { provide: getModelToken(Job.name), useValue: jobModel },
          { provide: getModelToken(Contract.name), useValue: contractModel },
          { provide: getModelToken(Transaction.name), useValue: transactionModel },
          { provide: getModelToken(User.name), useValue: {} },
          { provide: getModelToken(HelperProfile.name), useValue: {} },
          { provide: getModelToken(Quote.name), useValue: {} },
          { provide: getModelToken(Notification.name), useValue: {} },
          { provide: getModelToken(Wallet.name), useValue: {} },
          { provide: getModelToken(Withdrawal.name), useValue: {} },
          { provide: getModelToken(Review.name), useValue: {} },
          { provide: getModelToken(CustomerProfile.name), useValue: {} },
          { provide: getModelToken(SosBackupRequest.name), useValue: {} },
          { provide: getModelToken(HelperPenaltyEvent.name), useValue: {} },
          { provide: getModelToken(Service.name), useValue: {} },
          { provide: PaymentsService, useValue: paymentsService },
          { provide: JobsService, useValue: {} },
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({}) } },
        ],
      }).compile();

      adminService = module.get<AdminService>(AdminService);
    });

    it('blocks directRefund on cash payment', async () => {
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          payment_status: PaymentStatus.PAID,
          payment_method: 'cash',
        }),
      });

      await expect(
        adminService.directRefund('job123', 50_000, 'Khách đòi hoàn', 'admin1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('caps directRefund at actual paid amount', async () => {
      const jobId = new Types.ObjectId();
      jobModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: jobId,
          payment_status: PaymentStatus.PAID,
          payment_method: 'wallet',
          customer_id: new Types.ObjectId(),
        }),
      });
      contractModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ total_price: 100_000 }),
      });
      // Actually paid was only 40_000, attempting to refund 60_000 must fail
      paymentsService.getTotalPaidForJob.mockResolvedValue(40_000);

      await expect(
        adminService.directRefund(String(jobId), 60_000, 'Hoàn vượt mức', 'admin1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('API-M5: Invoices PDF grandTotal does not double-count SOS surcharge', () => {
    let invoicesService: InvoicesService;
    let jobModel: any;
    let contractModel: any;
    let invoiceModel: any;
    let userModel: any;

    const custId = new Types.ObjectId();
    const helpId = new Types.ObjectId();

    beforeEach(async () => {
      const dbJob = {
        _id: new Types.ObjectId(),
        title: 'Cứu hộ khẩn cấp',
        customer_id: { _id: custId, full_name: 'Khách hàng A', phone: '0901234567' },
        helper_id: { _id: helpId, full_name: 'Thợ B', phone: '0907654321' },
        payment_status: PaymentStatus.PAID,
        payment_method: 'wallet',
        sos_surcharge: 100_000,
        discount_amount: 0,
        loyalty_discount_amount: 0,
      };

      const chain: any = {};
      chain.populate = jest.fn().mockReturnValue(chain);
      chain.exec = jest.fn().mockResolvedValue(dbJob);

      jobModel = {
        findById: jest.fn().mockReturnValue(chain),
      };
      contractModel = {
        findOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            // total_price of SOS job ALREADY includes 100k sos_surcharge
            total_price: 300_000,
          }),
        }),
      };
      invoiceModel = {
        findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
        create: jest
          .fn()
          .mockImplementation(doc =>
            Promise.resolve(
              Array.isArray(doc)
                ? doc.map(d => ({ ...d, invoice_no: 'INV-123' }))
                : { ...doc, invoice_no: 'INV-123' },
            ),
          ),
      };
      userModel = {
        findById: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue({ full_name: 'Test' }) }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InvoicesService,
          { provide: getModelToken(Invoice.name), useValue: invoiceModel },
          { provide: getModelToken(Job.name), useValue: jobModel },
          { provide: getModelToken(Contract.name), useValue: contractModel },
          { provide: getModelToken(User.name), useValue: userModel },
        ],
      }).compile();

      invoicesService = module.get<InvoicesService>(InvoicesService);
    });

    it('computes grandTotal = 300.000₫ for SOS job without adding surcharge twice', async () => {
      const customerId = custId.toString();
      const jobId = new Types.ObjectId().toString();

      const renderPdfSpy = jest
        .spyOn(invoicesService as any, 'renderPdf')
        .mockImplementation((data: any) => data);

      await invoicesService.generateInvoicePdf(jobId, customerId, ['customer']);
      const rendered: any = renderPdfSpy.mock.calls[0][0];
      expect(rendered.totalPrice).toBe(300_000);
      expect(rendered.sosSurcharge).toBe(100_000);
      expect(rendered.grandTotal).toBe(300_000); // Must NOT be 400.000₫
    });
  });

  describe('API-M3: mockPayJob blocks cancelled/disputed jobs from resurrecting', () => {
    let paymentsService: PaymentsService;
    let jobModel: any;
    let walletModel: any;
    let transactionModel: any;
    let contractModel: any;

    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    beforeEach(async () => {
      const dbJob: any = {
        _id: new Types.ObjectId(jobId),
        customer_id: new Types.ObjectId(customerId),
        status: JobStatus.CANCELLED,
        payment_status: PaymentStatus.UNPAID,
      };

      jobModel = {
        findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(dbJob) }),
        findOneAndUpdate: jest.fn().mockImplementation(query => {
          if (query.status && !query.status.$in.includes(dbJob.status)) {
            return { exec: () => Promise.resolve(null) };
          }
          return { exec: () => Promise.resolve(dbJob) };
        }),
      };

      const dbWallet = {
        _id: new Types.ObjectId(),
        user_id: new Types.ObjectId(customerId),
        balance: 100_000,
      };

      walletModel = {
        findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(dbWallet) }),
        findOneAndUpdate: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(dbWallet) }),
      };

      transactionModel = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
          }),
        }),
        create: jest.fn().mockResolvedValue([{}]),
      };

      contractModel = {
        findOne: jest.fn().mockReturnValue({
          session: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ total_price: 50_000 }),
          }),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentsService,
          { provide: getModelToken(Wallet.name), useValue: walletModel },
          { provide: getModelToken(Transaction.name), useValue: transactionModel },
          { provide: getModelToken(Withdrawal.name), useValue: {} },
          { provide: getModelToken(HelperProfile.name), useValue: {} },
          { provide: getModelToken(Job.name), useValue: jobModel },
          { provide: getModelToken(Contract.name), useValue: contractModel },
          { provide: NotificationsService, useValue: { create: jest.fn() } },
          {
            provide: VouchersService,
            useValue: { redeemForJob: jest.fn(), restoreForJob: jest.fn() },
          },
          {
            provide: LoyaltyService,
            useValue: { redeemAtPayment: jest.fn(), reverseRedeemForJob: jest.fn() },
          },
        ],
      }).compile();

      paymentsService = module.get<PaymentsService>(PaymentsService);
    });

    it('rejects mockPayJob when job is CANCELLED', async () => {
      await expect(paymentsService.mockPayJob(customerId, jobId, 50_000, 'wallet')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('API-M6: deductCommissionForCashJob unsets claim flag when deduction fails', () => {
    let paymentsService: PaymentsService;
    let jobModel: any;
    let walletModel: any;
    let transactionModel: any;

    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    beforeEach(async () => {
      let isClaimed = false;

      jobModel = {
        findOneAndUpdate: jest.fn().mockImplementation(_query => {
          if (!isClaimed) {
            isClaimed = true;
            return {
              exec: () =>
                Promise.resolve({ _id: new Types.ObjectId(jobId), cash_commission_deducted: true }),
            };
          }
          return { exec: () => Promise.resolve(null) };
        }),
        updateOne: jest.fn().mockImplementation((_query, update) => {
          if (update.$unset?.cash_commission_deducted) {
            isClaimed = false;
          }
          return { exec: () => Promise.resolve({ modifiedCount: 1 }) };
        }),
      };

      const mockWallet = { _id: new Types.ObjectId(), balance: 10_000 };
      walletModel = {
        findOneAndUpdate: jest.fn().mockImplementation(query => {
          if (query.user_id) {
            return { exec: () => Promise.resolve(mockWallet) };
          }
          // Query by _id (balance deduction) fails to simulate race conflict across all 5 retries
          return { exec: () => Promise.resolve(null) };
        }),
      };

      transactionModel = {
        findOne: jest.fn().mockReturnValue({
          session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentsService,
          { provide: getModelToken(Wallet.name), useValue: walletModel },
          { provide: getModelToken(Transaction.name), useValue: transactionModel },
          { provide: getModelToken(Withdrawal.name), useValue: {} },
          { provide: getModelToken(HelperProfile.name), useValue: {} },
          { provide: getModelToken(Job.name), useValue: jobModel },
          { provide: getModelToken(Contract.name), useValue: {} },
          { provide: NotificationsService, useValue: { create: jest.fn() } },
          { provide: VouchersService, useValue: {} },
          { provide: LoyaltyService, useValue: {} },
        ],
      }).compile();

      paymentsService = module.get<PaymentsService>(PaymentsService);
    });

    it('rolls back cash_commission_deducted flag so that subsequent attempts can claim again', async () => {
      // First attempt fails due to wallet conflict
      await expect(
        paymentsService.deductCommissionForCashJob(helperId, jobId, 15_000, 85_000),
      ).rejects.toThrow(ConflictException);

      // Verify updateOne was called with $unset: { cash_commission_deducted: 1 }
      expect(jobModel.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        { $unset: { cash_commission_deducted: 1 } },
        { session: undefined },
      );
    });
  });
});

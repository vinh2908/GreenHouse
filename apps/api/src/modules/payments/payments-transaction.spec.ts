import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { Wallet, Transaction, Withdrawal } from './schemas/payment.schema';
import { HelperProfile } from '../helpers/schemas/helper-profile.schema';
import { Job, Contract } from '../jobs/schemas/job.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PaymentStatus, JobStatus } from '@homemate/types';
import { Types } from 'mongoose';

describe('PaymentsService - F5 & F19 Transaction and Stuck Processing', () => {
  let service: PaymentsService;
  let jobModel: any;
  let vouchersService: any;
  let loyaltyService: any;
  let mockSession: any;

  beforeEach(async () => {
    mockSession = {
      withTransaction: jest.fn().mockImplementation(async (cb) => {
        return await cb();
      }),
      endSession: jest.fn().mockResolvedValue(undefined),
    };

    const mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    jobModel = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) }),
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 2 }) }),
      db: mockConnection,
    };

    vouchersService = {
      redeemForJob: jest.fn().mockResolvedValue({
        discount_amount: 50000,
        voucher: { code: 'SALE50' },
      }),
      restoreForJob: jest.fn().mockResolvedValue({ restored: true, discount_amount: 50000 }),
    };

    loyaltyService = {
      redeemAtPayment: jest.fn().mockResolvedValue({
        points_redeemed: 100,
        discount_amount: 10000,
      }),
      reverseRedeemForJob: jest.fn().mockResolvedValue({ points_restored: 100 }),
    };

    const mockWalletModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), balance: 100000 }),
      }),
      db: mockConnection,
    };

    const mockTransactionModel = {
      create: jest.fn().mockImplementation((docs) => {
        const item = Array.isArray(docs) ? docs[0] : docs;
        return Array.isArray(docs) ? [{ ...item, _id: new Types.ObjectId() }] : { ...item, _id: new Types.ObjectId() };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(Wallet.name), useValue: mockWalletModel },
        { provide: getModelToken(Transaction.name), useValue: mockTransactionModel },
        { provide: getModelToken(Withdrawal.name), useValue: {} },
        { provide: getModelToken(HelperProfile.name), useValue: {} },
        { provide: getModelToken(Job.name), useValue: jobModel },
        {
          provide: getModelToken(Contract.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              session: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue({ total_price: 300000 }),
            }),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: VouchersService, useValue: vouchersService },
        { provide: LoyaltyService, useValue: loyaltyService },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('F19: clearStuckProcessingPayments should update stuck jobs and return modified count', async () => {
    const cleared = await service.clearStuckProcessingPayments();
    expect(cleared).toBe(2);
    expect(jobModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: PaymentStatus.PROCESSING,
      }),
      { $set: { payment_status: PaymentStatus.UNPAID } },
    );
  });

  it('F5: mockPayJob should wrap in transaction and rollback voucher & loyalty on failure', async () => {
    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const mockJob = {
      _id: new Types.ObjectId(jobId),
      customer_id: customerId,
      status: JobStatus.CONFIRMED,
      payment_status: PaymentStatus.UNPAID,
      voucher_code: 'SALE50',
      loyalty_points_requested: 100,
    };

    jobModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockJob),
    });

    jobModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ ...mockJob, payment_status: PaymentStatus.PROCESSING }),
    });

    // Make findByIdAndUpdate fail to trigger error rollback
    jobModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockRejectedValue(new Error('Simulated DB failure')),
    });

    await expect(
      service.mockPayJob(customerId, jobId, 300000, 'cash'),
    ).rejects.toThrow('Simulated DB failure');

    // Verify session started and withTransaction called
    expect(mockSession.withTransaction).toHaveBeenCalled();
    // Verify voucher rollback was invoked
    expect(vouchersService.restoreForJob).toHaveBeenCalledWith(customerId, jobId);
    // Verify loyalty rollback was invoked
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledWith(customerId, jobId);
    // Verify payment_status was reset to UNPAID
    expect(jobModel.updateOne).toHaveBeenCalledWith(
      { _id: mockJob._id, payment_status: PaymentStatus.PROCESSING },
      { $set: { payment_status: PaymentStatus.UNPAID } },
    );
  });
});


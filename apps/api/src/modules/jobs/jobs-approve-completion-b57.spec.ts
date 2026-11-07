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

/** Spec B57: nghiệm thu yêu cầu ít nhất 1 ảnh bằng chứng hoàn thành. */
describe('JobsService.approveCompletion (B57)', () => {
  let service: JobsService;
  let jobModel: any;
  let paymentsService: any;

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn(),
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
                status: 'active',
                save: jest.fn().mockResolvedValue(true),
              }),
            }),
          },
        },
        { provide: getModelToken(Service.name), useValue: {} },
        {
          provide: getModelToken(HelperProfile.name),
          useValue: {
            updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
          },
        },
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
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
            notifyAdmins: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ChatService, useValue: {} },
        {
          provide: PaymentsService,
          useValue: (paymentsService = {
            // G2: creditJobPayout bọc trả tiền trong runMoneyTransaction.
            runMoneyTransaction: jest.fn(async (fn: (s: any) => Promise<any>) => fn(undefined)),
            creditHelper: jest.fn().mockResolvedValue({}),
            creditHelperSimulated: jest.fn().mockResolvedValue({}),
            deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
            deductWallet: jest.fn().mockResolvedValue({}),
            // P0-2: payout chỉ giải ngân khi có thanh toán ví thật đã xác minh.
            hasVerifiedWalletPayment: jest.fn().mockResolvedValue(true),
            // Owner decision 2026-11-07 (keep simulation): mặc định không mô phỏng.
            hasSimulatedOnlinePayment: jest.fn().mockResolvedValue(false),
          }),
        },
        { provide: RoutingService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: VouchersService, useValue: {} },
        { provide: LoyaltyService, useValue: { awardForJob: jest.fn().mockResolvedValue(0) } },
        { provide: DisputesService, useValue: {} },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  function mockJob(completionPhotos: string[]) {
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();
    const jobId = new Types.ObjectId();
    const existing: any = {
      _id: jobId,
      customer_id: customerId,
      helper_id: helperId,
      status: JobStatus.PENDING_REVIEW,
      payment_status: PaymentStatus.PAID,
      payment_method: 'wallet',
      title: 'Dọn nhà',
      completion_photos: completionPhotos,
      events: [],
    };
    const completed: any = {
      ...existing,
      status: JobStatus.COMPLETED,
      review_reminder_sent: false,
      helper_id: helperId,
      title: 'Dọn nhà',
    };
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });
    jobModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(completed),
    });
    return { customerId, helperId, jobId };
  }

  it('thợ chưa chụp ảnh → khách nghiệm thu → 400 "chưa có ảnh bằng chứng"', async () => {
    const { customerId, jobId } = mockJob([]);
    await expect(
      service.approveCompletion(String(customerId), String(jobId), {
        rating: 5,
        review: 'Tốt',
      } as never),
    ).rejects.toThrow('Chưa có ảnh bằng chứng hoàn thành');
  });

  it('thợ chụp 1 ảnh → nghiệm thu → thành công', async () => {
    const { customerId, jobId } = mockJob(['https://cdn.example.com/photo1.jpg']);
    const result = await service.approveCompletion(String(customerId), String(jobId), {
      rating: 5,
      review: 'Tốt',
    } as never);
    expect(result.status).toBe(JobStatus.COMPLETED);
  });

  it('đơn trả bằng VietQR mô phỏng → nghiệm thu → giải ngân vào simulated_balance, không đúc tiền thật', async () => {
    const { customerId, jobId } = mockJob(['https://cdn.example.com/photo1.jpg']);
    paymentsService.hasVerifiedWalletPayment.mockResolvedValue(false);
    paymentsService.hasSimulatedOnlinePayment = jest.fn().mockResolvedValue(true);
    paymentsService.creditHelperSimulated = jest.fn().mockResolvedValue({});
    const result = await service.approveCompletion(String(customerId), String(jobId), {
      rating: 5,
      review: 'Tốt',
    } as never);
    expect(result.status).toBe(JobStatus.COMPLETED);
    expect(paymentsService.creditHelperSimulated).toHaveBeenCalled();
    expect(paymentsService.creditHelper).not.toHaveBeenCalled();
  });
});

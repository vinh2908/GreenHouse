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

/** Spec B55: phân xử hoàn 0₫ vẫn báo khách rõ "không hoàn tiền" + lý do, không ghi giao dịch hoàn 0₫. */
describe('JobsService.resolveDispute (B55)', () => {
  let service: JobsService;
  let jobModel: any;
  let paymentsService: any;
  let notificationsService: any;

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };

    paymentsService = {
      refundCustomer: jest.fn().mockResolvedValue({}),
      creditHelper: jest.fn().mockResolvedValue({}),
      deductCommissionForCashJob: jest.fn().mockResolvedValue({}),
    };

    notificationsService = {
      create: jest.fn().mockResolvedValue({}),
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
          useValue: { emitToJob: jest.fn(), emitToUser: jest.fn(), emitToAdmins: jest.fn(), broadcastHelperStatus: jest.fn() },
        },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ChatService, useValue: {} },
        { provide: PaymentsService, useValue: paymentsService },
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
  });

  it('phân xử hoàn 0₫ → khách nhận thông báo "không hoàn tiền" + lý do; ví không đổi', async () => {
    const adminId = new Types.ObjectId().toString();
    const customerId = new Types.ObjectId().toString();
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const mockJob: any = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      helper_id: new Types.ObjectId(helperId),
      status: JobStatus.DISPUTED,
      payment_status: PaymentStatus.PAID,
      payment_method: 'vietqr',
      title: 'Dọn nhà',
      events: [],
      save: jest.fn().mockResolvedValue(true),
    };
    jobModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockJob),
    });

    await service.resolveDispute(adminId, true, jobId, {
      action: 'refund_partial',
      refund_amount: 0,
      admin_note: 'Thợ đã làm đúng yêu cầu',
    } as never);

    // Không ghi giao dịch hoàn 0₫ vào ví
    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();

    const customerNotif = notificationsService.create.mock.calls.find(
      (c: any[]) => c[0].userId === customerId && c[0].type === 'dispute_resolved',
    );
    expect(customerNotif).toBeDefined();
    expect(customerNotif[0].body).toContain('không hoàn tiền');
    expect(customerNotif[0].body).toContain('Thợ đã làm đúng yêu cầu');
  });
});

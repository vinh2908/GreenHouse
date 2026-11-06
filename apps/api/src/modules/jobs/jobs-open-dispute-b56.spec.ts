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
import { JobStatus } from '@homemate/types';
import { Types } from 'mongoose';

/** Spec B56: mở tranh chấp trong 72 giờ sau khi đơn COMPLETED. */
describe('JobsService.openDispute (B56)', () => {
  let service: JobsService;
  let jobModel: any;

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
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
            findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
            findOneAndUpdate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(null),
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
          useValue: { emitToJob: jest.fn(), emitToUser: jest.fn(), emitToAdmins: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
            notifyAdmins: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ChatService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        { provide: RoutingService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: VouchersService, useValue: {} },
        { provide: LoyaltyService, useValue: {} },
        {
          provide: DisputesService,
          useValue: { createCaseFromJob: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  function mockJob(overrides: Record<string, unknown>) {
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();
    const job: any = {
      _id: new Types.ObjectId(),
      customer_id: customerId,
      helper_id: helperId,
      status: JobStatus.COMPLETED,
      title: 'Dọn nhà',
      events: [],
      save: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
    jobModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(job),
    });
    return { job, customerId, helperId };
  }

  it('đơn hoàn thành 1 giờ trước → mở tranh chấp → thành công', async () => {
    const { job, customerId } = mockJob({
      completed_at: new Date(Date.now() - 60 * 60 * 1000),
    });
    const result = await service.openDispute(String(customerId), 'customer', String(job._id), {
      reason: 'Phát hiện vết bẩn còn sót',
    } as never);
    expect(result.status).toBe(JobStatus.DISPUTED);
  });

  it('đơn hoàn thành 5 ngày trước → mở tranh chấp → bị chặn + hướng dẫn liên hệ hỗ trợ', async () => {
    const { job, customerId } = mockJob({
      completed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    await expect(
      service.openDispute(String(customerId), 'customer', String(job._id), {
        reason: 'Phát hiện lỗi muộn',
      } as never),
    ).rejects.toThrow('quá 72 giờ');
  });

  it('đơn đã hủy → mở tranh chấp → bị chặn', async () => {
    const { job, customerId } = mockJob({ status: JobStatus.CANCELLED });
    await expect(
      service.openDispute(String(customerId), 'customer', String(job._id), {
        reason: 'Muốn khiếu nại',
      } as never),
    ).rejects.toThrow('Không thể chuyển trạng thái');
  });
});

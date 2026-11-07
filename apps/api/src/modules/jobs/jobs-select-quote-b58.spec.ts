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

/**
 * Spec B58: chọn báo giá kiểm tra ngày/giờ làm việc (tương lai, 07:00–22:00).
 * Các test giờ hợp lệ chỉ kiểm chứng "qua được bước kiểm tra giờ" (lỗi tiếp
 * theo là Quote không tồn tại vì không mock báo giá).
 */
describe('JobsService.selectQuote (B58)', () => {
  let service: JobsService;
  let jobModel: any;
  let quoteModel: any;

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };
    quoteModel = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getModelToken(Job.name), useValue: jobModel },
        { provide: getModelToken(Quote.name), useValue: quoteModel },
        {
          provide: getModelToken(Contract.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
          },
        },
        { provide: getModelToken(Service.name), useValue: {} },
        { provide: getModelToken(HelperProfile.name), useValue: {} },
        { provide: getModelToken(HelperPenaltyEvent.name), useValue: {} },
        {
          provide: getModelToken(User.name),
          // F16: selectQuote kiểm tra is_verified của khách — mock trả về null (không có user) để qua cổng kiểm tra
          useValue: {
            findById: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
            }),
          },
        },
        {
          provide: AppGateway,
          useValue: { emitToJob: jest.fn(), emitToUser: jest.fn(), emitToAdmins: jest.fn() },
        },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: ChatService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        { provide: RoutingService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: VouchersService, useValue: {} },
        { provide: LoyaltyService, useValue: {} },
        { provide: DisputesService, useValue: {} },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  function mockJob(timeStart: string, dateOffsetDays = 1) {
    const customerId = new Types.ObjectId();
    const jobId = new Types.ObjectId();
    const d = new Date();
    d.setDate(d.getDate() + dateOffsetDays);
    const job: any = {
      _id: jobId,
      customer_id: customerId,
      status: JobStatus.RECEIVING_QUOTES,
      title: 'Dọn nhà',
      preferred_date: d.toISOString().slice(0, 10),
      preferred_time_start: timeStart,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      events: [],
    };
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });
    return { customerId, jobId };
  }

  it('chọn báo giá cho đơn đặt hôm qua → 400', async () => {
    const { customerId, jobId } = mockJob('09:00', -1);
    await expect(
      service.selectQuote(String(customerId), String(jobId), {
        quote_id: new Types.ObjectId().toHexString(),
      } as never),
    ).rejects.toThrow('Thời gian bắt đầu công việc đã qua');
  });

  it('chọn báo giá cho đơn đặt lúc 23:00 → 400', async () => {
    const { customerId, jobId } = mockJob('23:00');
    await expect(
      service.selectQuote(String(customerId), String(jobId), {
        quote_id: new Types.ObjectId().toHexString(),
      } as never),
    ).rejects.toThrow('Giờ làm việc phải trong khung 07:00–22:00');
  });

  it('chọn báo giá cho đơn đặt lúc 06:30 → 400', async () => {
    const { customerId, jobId } = mockJob('06:30');
    await expect(
      service.selectQuote(String(customerId), String(jobId), {
        quote_id: new Types.ObjectId().toHexString(),
      } as never),
    ).rejects.toThrow('Giờ làm việc phải trong khung 07:00–22:00');
  });

  it('chọn báo giá cho đơn đặt ngày mai 09:00 → qua được bước kiểm tra giờ', async () => {
    const { customerId, jobId } = mockJob('09:00');
    await expect(
      service.selectQuote(String(customerId), String(jobId), {
        quote_id: new Types.ObjectId().toHexString(),
      } as never),
    ).rejects.toThrow('Quote không tồn tại');
  });

  it('H4 (G3): chọn báo giá cho đơn đặt lúc 22:00 → qua được bước kiểm tra giờ', async () => {
    const { customerId, jobId } = mockJob('22:00');
    await expect(
      service.selectQuote(String(customerId), String(jobId), {
        quote_id: new Types.ObjectId().toHexString(),
      } as never),
    ).rejects.toThrow('Quote không tồn tại');
  });

  it('H4 (G3): chọn báo giá cho đơn đặt lúc 22:01 → 400', async () => {
    const { customerId, jobId } = mockJob('22:01');
    await expect(
      service.selectQuote(String(customerId), String(jobId), {
        quote_id: new Types.ObjectId().toHexString(),
      } as never),
    ).rejects.toThrow('Giờ làm việc phải trong khung 07:00–22:00');
  });

  it('H4 (G3): chọn báo giá cho đơn đặt lúc 06:59 → 400', async () => {
    const { customerId, jobId } = mockJob('06:59');
    await expect(
      service.selectQuote(String(customerId), String(jobId), {
        quote_id: new Types.ObjectId().toHexString(),
      } as never),
    ).rejects.toThrow('Giờ làm việc phải trong khung 07:00–22:00');
  });
});

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
import { NOTIFICATION_TYPES } from '@homemate/constants';
import { Types } from 'mongoose';

describe('JobsService - F7 Refund Retry & Notification', () => {
  let service: JobsService;
  let jobModel: any;
  let paymentsService: any;
  let notificationsService: any;

  beforeEach(async () => {
    jobModel = {
      findById: jest.fn(),
      find: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };

    paymentsService = {
      refundCustomer: jest.fn(),
      hasSuccessfulRefund: jest.fn().mockResolvedValue(false),
    };

    notificationsService = {
      create: jest.fn().mockResolvedValue({}),
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
                lean: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([]),
                }),
              }),
            }),
          },
        },
        {
          provide: getModelToken(Contract.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
          },
        },
        { provide: getModelToken(Service.name), useValue: {} },
        { provide: getModelToken(HelperProfile.name), useValue: {} },
        { provide: getModelToken(HelperPenaltyEvent.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        {
          provide: AppGateway,
          useValue: { emitToJob: jest.fn(), emitToUser: jest.fn(), emitToAdmins: jest.fn() },
        },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ChatService, useValue: {} },
        { provide: PaymentsService, useValue: paymentsService },
        { provide: RoutingService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: VouchersService, useValue: { restoreForJob: jest.fn() } },
        { provide: LoyaltyService, useValue: { reverseRedeemForJob: jest.fn() } },
        { provide: DisputesService, useValue: {} },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('F7: cancelJob should send refund_received notification on successful refund', async () => {
    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const mockJob: any = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      status: JobStatus.CONFIRMED,
      payment_status: PaymentStatus.PAID,
      payment_method: 'vietqr',
      total_price: 350000,
      title: 'Dọn nhà',
      events: [],
      save: jest.fn().mockResolvedValue(true),
    };

    jobModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockJob),
    });
    paymentsService.refundCustomer.mockResolvedValue({});

    await service.cancelJob(customerId, 'customer', jobId, { reason: 'Khách bận đột xuất' });

    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      customerId,
      jobId,
      350000,
      'Khách bận đột xuất',
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NOTIFICATION_TYPES.REFUND_RECEIVED,
        userId: customerId,
      }),
    );
    expect(mockJob.payment_status).toBe(PaymentStatus.REFUNDED);
    expect(mockJob.refund_pending_retry).toBe(false);
  });

  it('F7: cancelJob should set refund_pending_retry flag if refund fails', async () => {
    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const mockJob: any = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      status: JobStatus.CONFIRMED,
      payment_status: PaymentStatus.PAID,
      payment_method: 'vietqr',
      total_price: 350000,
      title: 'Dọn nhà',
      events: [],
      save: jest.fn().mockResolvedValue(true),
    };

    jobModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockJob),
    });
    paymentsService.refundCustomer.mockRejectedValue(new Error('Gateway timeout'));

    await service.cancelJob(customerId, 'customer', jobId, { reason: 'Khách bận đột xuất' });

    expect(mockJob.refund_pending_retry).toBe(true);
    expect(mockJob.refund_pending_amount).toBe(350000);
    expect(mockJob.refund_retry_count).toBe(0);
  });

  it('G1: sweepPendingRefundRetries — retry thành công → notification đúng số tiền, không TypeError, count không tăng', async () => {
    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const pendingJob: any = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      status: JobStatus.CANCELLED,
      payment_status: PaymentStatus.PAID,
      title: 'Dọn nhà',
      refund_pending_retry: true,
      refund_pending_amount: 350000,
      refund_pending_reason: 'Thử lại hoàn tiền đơn hủy',
      refund_retry_count: 1,
      save: jest.fn().mockImplementation(async function (this: any) {
        return this;
      }),
    };

    jobModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([pendingJob]),
    });
    paymentsService.refundCustomer.mockResolvedValue({});

    const recovered = await service.sweepPendingRefundRetries();

    expect(recovered).toBe(1);
    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      customerId,
      jobId,
      350000,
      'Thử lại hoàn tiền đơn hủy',
    );
    // Notification được tạo với đúng số tiền (không TypeError do đọc
    // refund_pending_amount sau khi đã gán undefined).
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NOTIFICATION_TYPES.REFUND_RECEIVED,
        userId: customerId,
        body: expect.stringContaining('350.000'),
        payload: expect.objectContaining({ job_id: jobId, amount: 350000 }),
      }),
    );
    expect(pendingJob.refund_pending_amount).toBeUndefined();
    expect(pendingJob.refund_pending_retry).toBe(false);
    expect(pendingJob.payment_status).toBe(PaymentStatus.REFUNDED);
    // Count KHÔNG tăng khi retry thành công (bug cũ: TypeError làm count +1
    // và log "Retry refund failed" dù tiền đã hoàn xong).
    expect(pendingJob.refund_retry_count).toBe(1);
  });

  it('G1: sweepPendingRefundRetries — retry thất bại → count tăng 1, không notification', async () => {
    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const pendingJob: any = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      status: JobStatus.CANCELLED,
      payment_status: PaymentStatus.PAID,
      title: 'Dọn nhà',
      refund_pending_retry: true,
      refund_pending_amount: 200000,
      refund_pending_reason: 'Thử lại hoàn tiền đơn hủy',
      refund_retry_count: 1,
      save: jest.fn().mockResolvedValue(true),
    };

    jobModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([pendingJob]),
    });
    paymentsService.refundCustomer.mockRejectedValue(new Error('Gateway timeout'));

    const recovered = await service.sweepPendingRefundRetries();

    expect(recovered).toBe(0);
    expect(pendingJob.refund_retry_count).toBe(2);
    expect(pendingJob.refund_pending_amount).toBe(200000);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('H8 (G1): job.save() lỗi SAU khi hoàn tiền → lần quét sau KHÔNG hoàn trùng (tổng hoàn = 1 lần)', async () => {
    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const pendingJob: any = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      status: JobStatus.CANCELLED,
      payment_status: PaymentStatus.PAID,
      title: 'Dọn nhà',
      refund_pending_retry: true,
      refund_pending_amount: 350000,
      refund_pending_reason: 'Thử lại hoàn tiền đơn hủy',
      refund_retry_count: 1,
      // Lần save đầu (sau refundCustomer) lỗi — mô phỏng đúng sót H8.
      // Các lần save sau (trong catch + lần quét 2) thành công.
      save: jest.fn().mockRejectedValueOnce(new Error('DB save failed')).mockResolvedValue(true),
    };

    jobModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([pendingJob]),
    });
    paymentsService.refundCustomer.mockResolvedValue({});
    paymentsService.hasSuccessfulRefund.mockResolvedValue(false);

    // Lần quét 1: tiền đã hoàn (refundCustomer 1 lần) nhưng save lỗi → chưa recovered.
    const recovered1 = await service.sweepPendingRefundRetries();
    expect(recovered1).toBe(0);
    expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    expect(notificationsService.create).not.toHaveBeenCalled();

    // DB thật không lưu được lần gán trong bộ nhớ ở lần quét 1 (save lỗi),
    // nên lần quét 2 vẫn thấy đơn ở trạng thái chờ hoàn — reset lại đúng
    // trạng thái DB để mô phỏng lần quét sau.
    pendingJob.refund_pending_retry = true;
    pendingJob.refund_pending_amount = 350000;
    pendingJob.refund_pending_reason = 'Thử lại hoàn tiền đơn hủy';
    pendingJob.payment_status = PaymentStatus.PAID;
    // Sổ giao dịch đã có bản ghi refund success từ lần quét 1.
    paymentsService.hasSuccessfulRefund.mockResolvedValue(true);

    // Lần quét 2: guard phát hiện đã hoàn → KHÔNG gọi refundCustomer nữa,
    // chỉ đồng bộ trạng thái + gửi notification, tính là recovered.
    const recovered2 = await service.sweepPendingRefundRetries();
    expect(recovered2).toBe(1);
    expect(paymentsService.refundCustomer).toHaveBeenCalledTimes(1);
    expect(pendingJob.payment_status).toBe(PaymentStatus.REFUNDED);
    expect(pendingJob.refund_pending_retry).toBe(false);
    expect(pendingJob.refund_pending_amount).toBeUndefined();
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NOTIFICATION_TYPES.REFUND_RECEIVED,
        userId: customerId,
        body: expect.stringContaining('350.000'),
        payload: expect.objectContaining({ job_id: jobId, amount: 350000 }),
      }),
    );
  });

  it('H8 (G1): đơn đã ở trạng thái REFUNDED nhưng cờ retry còn sót → không hoàn nữa, chỉ đồng bộ', async () => {
    const customerId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const pendingJob: any = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      status: JobStatus.CANCELLED,
      payment_status: PaymentStatus.REFUNDED,
      title: 'Dọn nhà',
      refund_pending_retry: true,
      refund_pending_amount: 350000,
      refund_pending_reason: 'Thử lại hoàn tiền đơn hủy',
      refund_retry_count: 1,
      save: jest.fn().mockResolvedValue(true),
    };

    jobModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([pendingJob]),
    });

    const recovered = await service.sweepPendingRefundRetries();

    expect(recovered).toBe(1);
    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    expect(pendingJob.refund_pending_retry).toBe(false);
    expect(pendingJob.refund_pending_amount).toBeUndefined();
  });
});

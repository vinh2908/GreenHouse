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
import { JobStatus, QuoteStatus, VerificationStatus } from '@homemate/types';
import { Types } from 'mongoose';

/**
 * Live review R1 — vòng soát logic quote / trạng thái đơn / hoàn tác bỏ qua.
 * Mỗi test FAIL trên code cũ và PASS sau fix (xem chú thích từng test).
 */
describe('JobsService live review R1 (quote lifecycle)', () => {
  let service: JobsService;
  let jobModel: any;
  let quoteModel: any;
  let helperModel: any;
  let contractModel: any;
  let quoteFindExec: jest.Mock;

  function mockJob(status: JobStatus, overrides: Record<string, unknown> = {}) {
    const job: any = {
      _id: new Types.ObjectId(),
      customer_id: new Types.ObjectId(),
      status,
      title: 'Dọn nhà',
      preferred_date: new Date(Date.now() + 86400000),
      preferred_time_start: '09:00',
      preferred_time_end: '11:00',
      estimated_duration: 2,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      events: [],
      ...overrides,
    };
    jobModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(job) });
    return job;
  }

  beforeEach(async () => {
    quoteFindExec = jest.fn().mockResolvedValue([]);
    jobModel = {
      findById: jest.fn(),
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };
    quoteModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({ exec: quoteFindExec }),
        }),
      }),
      create: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };
    helperModel = {
      findOne: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            verification_status: VerificationStatus.APPROVED,
            status: 'online',
            user_id: { full_name: 'Thợ Giỏi', is_verified: true, status: 'active' },
          }),
        }),
      }),
      exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'x' }) }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    contractModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getModelToken(Job.name), useValue: jobModel },
        { provide: getModelToken(Quote.name), useValue: quoteModel },
        { provide: getModelToken(Contract.name), useValue: contractModel },
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
        {
          provide: getModelToken(User.name),
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
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
            notifyNewQuote: jest.fn().mockResolvedValue({}),
            notifyAdmins: jest.fn().mockResolvedValue({}),
            notifyQuoteRejected: jest.fn().mockResolvedValue({}),
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

    service = module.get<JobsService>(JobsService);
    jest.spyOn(service, 'checkHelperScheduleConflict').mockResolvedValue(undefined as any);
  });

  describe('F1: selectQuote — rollback tạo hợp đồng lỗi không hồi sinh báo giá đã từ chối/hết hạn từ trước', () => {
    it('chỉ khôi phục đúng các báo giá mà lần chọn này vừa từ chối', async () => {
      const customerId = new Types.ObjectId();
      const helperId = new Types.ObjectId();
      const otherHelperId = new Types.ObjectId();
      const quoteId = new Types.ObjectId();
      const otherQuoteId = new Types.ObjectId();
      const job = mockJob(JobStatus.RECEIVING_QUOTES, { customer_id: customerId });

      const selectedQuote: any = {
        _id: quoteId,
        job_id: job._id,
        helper_id: helperId,
        status: QuoteStatus.PENDING,
        labor_cost: 100000,
        materials_cost: 0,
        total_price: 100000,
        platform_fee: 15000,
        helper_receives: 85000,
        warranty_days: 0,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      };
      quoteModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(selectedQuote) });
      quoteModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...selectedQuote, status: QuoteStatus.ACCEPTED }),
      });
      jobModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...job, status: JobStatus.CONFIRMED }),
      });
      // Chỉ 1 báo giá khác đang PENDING (bị lần chọn này từ chối); các báo
      // giá REJECTED/EXPIRED trước đó KHÔNG có trong danh sách này.
      quoteFindExec.mockResolvedValue([{ _id: otherQuoteId, helper_id: otherHelperId }]);
      contractModel.create.mockRejectedValue(new Error('contract boom'));

      await expect(
        service.selectQuote(String(customerId), String(job._id), {
          quote_id: quoteId.toHexString(),
        } as never),
      ).rejects.toThrow('contract boom');

      const rollbackCalls = quoteModel.updateMany.mock.calls.filter(
        (c: any[]) => c[1]?.$set?.status === QuoteStatus.PENDING,
      );
      expect(rollbackCalls).toHaveLength(1);
      // FAIL trên code cũ: filter là { _id: { $ne: quote_id } } — hồi sinh mọi
      // báo giá khác, kể cả REJECTED/EXPIRED/WITHDRAWN từ trước.
      expect(rollbackCalls[0][0]).toEqual(
        expect.objectContaining({
          job_id: expect.anything(),
          _id: { $in: [otherQuoteId] },
        }),
      );
      expect(rollbackCalls[0][0]._id).not.toHaveProperty('$ne');
    });
  });

  describe('F2: rejectQuote — từ chối báo giá chờ cuối cùng phải đồng bộ đơn về OPEN + count 0', () => {
    it('gọi syncJobQuotesState: total_quotes_count 0, status OPEN', async () => {
      const customerId = new Types.ObjectId();
      const helperId = new Types.ObjectId();
      const job = mockJob(JobStatus.RECEIVING_QUOTES, { customer_id: customerId });
      const quote: any = {
        _id: new Types.ObjectId(),
        job_id: job._id,
        helper_id: helperId,
        status: QuoteStatus.PENDING,
        save: jest.fn().mockResolvedValue(undefined),
      };
      quoteModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(quote) });

      await service.rejectQuote(String(customerId), String(job._id), String(quote._id));

      expect(quote.status).toBe(QuoteStatus.REJECTED);
      // FAIL trên code cũ: findOneAndUpdate không bao giờ được gọi (không sync),
      // đơn kẹt RECEIVING_QUOTES + total_quotes_count cũ.
      expect(jobModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({
            $in: expect.arrayContaining([JobStatus.OPEN, JobStatus.RECEIVING_QUOTES]),
          }),
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ total_quotes_count: 0, status: JobStatus.OPEN }),
        }),
      );
    });
  });

  describe('F3: submitQuote — báo giá EXPIRED được gửi lại như WITHDRAWN/REJECTED', () => {
    it('thợ gửi lại báo giá sau khi báo giá cũ hết hạn 24h (đơn vẫn mở 72h)', async () => {
      const helperId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      mockJob(JobStatus.OPEN, {
        customer_id: new Types.ObjectId(),
        preferred_date: new Date(Date.now() + 86400000),
      });
      const expiredQuote: any = {
        _id: new Types.ObjectId(),
        status: QuoteStatus.EXPIRED,
        labor_cost: 100000,
        materials_cost: 0,
        total_price: 100000,
        save: jest.fn().mockResolvedValue({}),
      };
      quoteModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(expiredQuote) });
      quoteModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      // FAIL trên code cũ: ném ConflictException 'Bạn đã gửi báo giá cho đơn
      // hàng này' — thợ mất hẳn quyền báo giá cho đơn còn mở.
      await service.submitQuote(helperId, jobId, {
        labor_cost: 150000,
        estimated_duration: 2,
      } as any);

      expect(expiredQuote.status).toBe(QuoteStatus.PENDING);
      expect(expiredQuote.labor_cost).toBe(150000);
      expect(expiredQuote.save).toHaveBeenCalled();
      expect(quoteModel.create).not.toHaveBeenCalled();
    });
  });

  describe('F4: unrejectJob — chỉ hoàn tác trên đơn đang mở, chỉ hồi sinh báo giá chưa hết hạn', () => {
    it('đơn đã CONFIRMED → chặn, không chạm quote hay rejected_helper_ids', async () => {
      const helperId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      mockJob(JobStatus.CONFIRMED);

      // FAIL trên code cũ: không chặn — updateMany hồi sinh báo giá WITHDRAWN
      // thành PENDING trên đơn đã chốt thợ khác.
      await expect(service.unrejectJob(helperId, jobId)).rejects.toThrow(
        'Chỉ có thể hoàn tác bỏ qua đơn hàng đang mở',
      );
      expect(quoteModel.updateMany).not.toHaveBeenCalled();
      expect(jobModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('đơn OPEN → hoàn tác, filter chỉ hồi sinh báo giá chưa hết hạn', async () => {
      const helperId = new Types.ObjectId().toString();
      const jobId = new Types.ObjectId().toString();
      mockJob(JobStatus.OPEN);
      quoteModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      const res = await service.unrejectJob(helperId, jobId);
      expect(res.success).toBe(true);
      // FAIL trên code cũ (nửa filter hết hạn): filter không có expires_at $gt
      // nên báo giá WITHDRAWN đã quá hạn cũng bị hồi sinh thành PENDING.
      expect(quoteModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: QuoteStatus.WITHDRAWN,
          expires_at: { $gt: expect.any(Date) },
        }),
        { $set: { status: QuoteStatus.PENDING } },
      );
    });
  });

  describe('F5: sweepExpiredJobsAndQuotes — báo giá lẻ hết hạn phải đồng bộ đơn', () => {
    it('hết hạn 1 báo giá lẻ → sync đơn về OPEN + count 0', async () => {
      const jobId = new Types.ObjectId();
      mockJob(JobStatus.RECEIVING_QUOTES, { _id: jobId });
      quoteFindExec.mockResolvedValue([{ job_id: jobId }]);

      await service.sweepExpiredJobsAndQuotes();

      expect(quoteModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ status: QuoteStatus.PENDING }),
        { $set: { status: QuoteStatus.EXPIRED } },
      );
      // FAIL trên code cũ: không sync — đơn kẹt RECEIVING_QUOTES với
      // total_quotes_count cũ dù không còn báo giá chờ nào.
      expect(jobModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({
            $in: expect.arrayContaining([JobStatus.OPEN, JobStatus.RECEIVING_QUOTES]),
          }),
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ total_quotes_count: 0, status: JobStatus.OPEN }),
        }),
      );
    });
  });
});

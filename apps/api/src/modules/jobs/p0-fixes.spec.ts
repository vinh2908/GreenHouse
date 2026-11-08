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
import { JobStatus, QuoteStatus, PaymentStatus, VerificationStatus } from '@homemate/types';
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

      await expect(jobsService.rejectJob(helperId, jobId)).rejects.toThrow(BadRequestException);
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

      const res = await jobsService.rejectJob(helperId, jobId);
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

      const res = await jobsService.unrejectJob(helperId, jobId);
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

      const res = await jobsService.withdrawQuote(helperId, jobId);
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
});

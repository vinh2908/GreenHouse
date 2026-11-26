import { Types } from 'mongoose';
import { JobStatus, QuoteStatus } from '@homemate/types';
import { JobsService } from './jobs.service';

describe('JobsService — R23 Mục 4 (đơn nhóm chọn đủ số thợ)', () => {
  const makeQuery = (resolved: any) => ({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(resolved),
  });

  function setupService() {
    const jobModel: any = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(() => makeQuery({})),
    };
    const quoteModel: any = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      updateMany: jest.fn(() => makeQuery({})),
      updateOne: jest.fn(() => makeQuery({})),
    };
    const contractModel: any = {
      create: jest.fn(),
    };
    const helperModel: any = {
      findOne: jest.fn(),
      updateOne: jest.fn(() => makeQuery({})),
    };
    const userModel: any = {
      findById: jest.fn(() => makeQuery({ is_verified: true })),
    };
    const gateway: any = {
      emitToUser: jest.fn(),
      emitToJob: jest.fn(),
      emitToAdmins: jest.fn(),
    };
    const notificationsService: any = {
      notifyQuoteAccepted: jest.fn().mockResolvedValue(undefined),
      notifyQuoteRejected: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
    };
    const chatService: any = {
      getOrCreateConversation: jest.fn().mockResolvedValue(undefined),
      addParticipantByJob: jest.fn().mockResolvedValue(undefined),
    };
    const paymentsService: any = {
      runMoneyTransaction: jest.fn(async (fn: any) => fn(undefined)),
      creditHelper: jest.fn().mockResolvedValue(undefined),
    };

    const service: any = Object.create(JobsService.prototype);
    Object.assign(service, {
      jobModel,
      quoteModel,
      contractModel,
      helperModel,
      userModel,
      gateway,
      notificationsService,
      chatService,
      paymentsService,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    jest.spyOn(service, 'isVerifiedHelper').mockResolvedValue(true);
    jest.spyOn(service, 'checkHelperScheduleConflict').mockResolvedValue(undefined);
    jest.spyOn(service, 'invalidateMatchingCache').mockResolvedValue(undefined);
    jest.spyOn(service, 'emitJobStatusChange').mockImplementation(() => undefined);

    return {
      service,
      jobModel,
      quoteModel,
      contractModel,
      helperModel,
      gateway,
      notificationsService,
      paymentsService,
    };
  }

  it('đơn nhóm helpers_needed=2: chọn thợ 1/2 giữ RECEIVING_QUOTES, không từ chối báo giá khác, chưa tạo contract', async () => {
    const { service, jobModel, quoteModel, contractModel, helperModel, notificationsService } =
      setupService();
    const customerId = new Types.ObjectId();
    const h1 = new Types.ObjectId();
    const q1Id = new Types.ObjectId();
    const jobId = new Types.ObjectId();

    const job: any = {
      _id: jobId,
      customer_id: customerId,
      title: 'Dọn kho nhóm 2 người',
      status: JobStatus.RECEIVING_QUOTES,
      helpers_needed: 2,
      helper_id: null,
      team: [],
      events: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const q1: any = {
      _id: q1Id,
      job_id: jobId,
      helper_id: h1,
      status: QuoteStatus.PENDING,
      labor_cost: 100000,
      materials_cost: 0,
      total_price: 100000,
      platform_fee: 15000,
      helper_receives: 85000,
      warranty_days: 0,
    };

    jobModel.findById.mockReturnValue(makeQuery(job));
    quoteModel.findById.mockReturnValue(makeQuery(q1));
    helperModel.findOne.mockReturnValue(
      makeQuery({ user_id: { full_name: 'H1', status: 'active' }, status: 'online' }),
    );
    quoteModel.findOneAndUpdate.mockReturnValue(makeQuery({ ...q1, status: QuoteStatus.ACCEPTED }));
    const updatedJob1 = {
      ...job,
      helper_id: h1,
      selected_quote_id: q1Id,
      status: JobStatus.RECEIVING_QUOTES,
      events: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    jobModel.findOneAndUpdate.mockReturnValue(makeQuery(updatedJob1));

    const res = await service.selectQuote(String(customerId), String(jobId), {
      quote_id: String(q1Id),
    });

    expect(res.job.status).toBe(JobStatus.RECEIVING_QUOTES);
    expect(String(res.job.helper_id)).toBe(String(h1));
    expect(res.contract).toBeNull();
    expect(quoteModel.updateMany).not.toHaveBeenCalled();
    expect(notificationsService.notifyQuoteRejected).not.toHaveBeenCalled();
    expect(contractModel.create).not.toHaveBeenCalled();
  });

  it('đơn nhóm helpers_needed=2: chọn thợ 2/2 mới chốt CONFIRMED, cộng tổng vào 1 hợp đồng & từ chối báo giá thừa', async () => {
    const {
      service,
      jobModel,
      quoteModel,
      contractModel,
      helperModel,
      notificationsService,
      gateway,
    } = setupService();
    const customerId = new Types.ObjectId();
    const h1 = new Types.ObjectId();
    const h2 = new Types.ObjectId();
    const h3 = new Types.ObjectId();
    const q1Id = new Types.ObjectId();
    const q2Id = new Types.ObjectId();
    const q3Id = new Types.ObjectId();
    const jobId = new Types.ObjectId();

    const job: any = {
      _id: jobId,
      customer_id: customerId,
      title: 'Dọn kho nhóm 2 người',
      status: JobStatus.RECEIVING_QUOTES,
      helpers_needed: 2,
      helper_id: h1,
      selected_quote_id: q1Id,
      team: [],
      events: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const q1: any = {
      _id: q1Id,
      job_id: jobId,
      helper_id: h1,
      status: QuoteStatus.ACCEPTED,
      labor_cost: 100000,
      materials_cost: 0,
      total_price: 100000,
      platform_fee: 15000,
      helper_receives: 85000,
      warranty_days: 3,
    };
    const q2: any = {
      _id: q2Id,
      job_id: jobId,
      helper_id: h2,
      status: QuoteStatus.PENDING,
      labor_cost: 200000,
      materials_cost: 50000,
      total_price: 250000,
      platform_fee: 37500,
      helper_receives: 212500,
      warranty_days: 7,
    };

    jobModel.findById.mockReturnValue(makeQuery(job));
    quoteModel.findById.mockReturnValue(makeQuery(q2));
    helperModel.findOne.mockReturnValue(
      makeQuery({ user_id: { full_name: 'H2', status: 'active' }, status: 'online' }),
    );
    quoteModel.findOneAndUpdate.mockReturnValue(makeQuery({ ...q2, status: QuoteStatus.ACCEPTED }));

    const updatedJob2: any = {
      ...job,
      status: JobStatus.CONFIRMED,
      team: [
        {
          helper_id: h2,
          role: 'member',
          status: 'accepted',
          split_percent: 0,
          quote_id: q2Id,
          fixed_payout: 212500,
        },
      ],
      events: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    jobModel.findOneAndUpdate.mockReturnValue(makeQuery(updatedJob2));
    quoteModel.find
      .mockReturnValueOnce(makeQuery([{ _id: q3Id, helper_id: h3 }]))
      .mockReturnValueOnce(makeQuery([q1, { ...q2, status: QuoteStatus.ACCEPTED }]));
    contractModel.create.mockImplementation(async (doc: any) => ({
      _id: new Types.ObjectId(),
      ...doc,
    }));

    const res = await service.selectQuote(String(customerId), String(jobId), {
      quote_id: String(q2Id),
    });

    expect(res.job.status).toBe(JobStatus.CONFIRMED);
    expect(contractModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        labor_cost: 300000,
        materials_cost: 50000,
        total_price: 350000,
        platform_fee: 52500,
        helper_receives: 297500,
        warranty_days: 7,
      }),
    );
    expect(quoteModel.updateMany).toHaveBeenCalled();
    expect(notificationsService.notifyQuoteRejected).toHaveBeenCalledWith(
      String(h3),
      'Dọn kho nhóm 2 người',
      String(jobId),
      String(q3Id),
    );
    expect(gateway.emitToUser).toHaveBeenCalledWith(
      String(h3),
      expect.any(String),
      expect.objectContaining({ quote_id: String(q3Id) }),
    );
  });

  it('creditJobPayout giải ngân đúng fixed_payout cho từng thợ báo giá + giữ nguyên split_percent cho thợ do lead mời', async () => {
    const { service, paymentsService } = setupService();
    const leadId = new Types.ObjectId();
    const mQuoteId = new Types.ObjectId();
    const mSplitId = new Types.ObjectId();
    const job: any = {
      _id: new Types.ObjectId(),
      helper_id: leadId,
      team: [
        { helper_id: mQuoteId, role: 'member', status: 'accepted', fixed_payout: 170000, split_percent: 67 },
        { helper_id: mSplitId, role: 'member', status: 'accepted', split_percent: 20 },
      ],
    };

    // Total = 270,000: mQuote gets exact 170,000; pool for lead+split = 100,000 -> mSplit gets 20,000; lead gets 80,000
    await service.creditJobPayout(job, 270000);

    expect(paymentsService.creditHelper).toHaveBeenCalledWith(
      String(mQuoteId),
      String(job._id),
      170000,
      undefined,
    );
    expect(paymentsService.creditHelper).toHaveBeenCalledWith(
      String(mSplitId),
      String(job._id),
      20000,
      undefined,
    );
    expect(paymentsService.creditHelper).toHaveBeenCalledWith(
      String(leadId),
      String(job._id),
      80000,
      undefined,
    );
  });
});

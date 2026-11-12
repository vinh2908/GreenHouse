import { JobsService } from './jobs.service';
import { Types } from 'mongoose';

/**
 * Spec B4: thợ phải thấy báo giá ĐÃ ĐƯỢC CHỌN của chính mình.
 *
 * Live 2026-11-12 (đơn B 6af59e07bb2b94f98da7e088): sau khi khách chọn báo giá
 * 70.000₫, thẻ tiến độ của thợ lúc hiện lúc ẩn. Một trong hai nguyên nhân gốc
 * là GET /jobs/:id/quotes với vai trò helper chỉ lọc status='pending' nên
 * báo giá vừa được chọn "biến mất" khỏi phía thợ — client mất luôn nguồn
 * chứng cứ thứ hai cho thấy đơn đã được giao (nguồn thứ nhất là
 * job.helper_id, có thể còn null trong snapshot cache cũ).
 *
 * Revert check: với code cũ, query gửi cho quoteModel.find là
 * { status: 'pending' } nên test (a) fail — mock mô phỏng filter Mongo thật
 * nên báo giá accepted không nằm trong kết quả.
 */
describe('JobsService.getJobQuotes (B4: helper sees own accepted quote)', () => {
  const jobId = '507f1f77bcf86cd799439011';
  const customerId = '507f1f77bcf86cd799439012';
  const helperId = '507f1f77bcf86cd799439013';
  const otherHelperId = '507f1f77bcf86cd799439014';

  const mockJob = { _id: jobId, customer_id: customerId, title: 'TEST Q1-B' };

  function buildService(quotesInDb: any[]) {
    let capturedQuery: any = null;
    const jobModel: any = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockJob) }),
    };
    // Mock mô phỏng filter Mongo thật: chỉ trả các quote khớp query.
    // Thêm toObject() như Mongoose document (nhánh customer gọi quote.toObject()).
    const docsInDb = quotesInDb.map(q => ({
      ...q,
      toObject() {
        return { ...this };
      },
    }));
    const quoteModel: any = {
      find: jest.fn().mockImplementation((query: any) => {
        capturedQuery = query;
        const wanted: string[] = Array.isArray(query?.status?.$in)
          ? query.status.$in
          : [query?.status];
        const mine = docsInDb.filter(
          q =>
            String(q.helper_id) === String(query?.helper_id ?? q.helper_id) &&
            wanted.includes(q.status),
        );
        return {
          populate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mine) }),
        };
      }),
    };
    const helperModel: any = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest
              .fn()
              .mockResolvedValue(
                quotesInDb.map(q => ({ user_id: q.helper_id, verification_status: 'approved' })),
              ),
          }),
        }),
      }),
    };
    const dummy = {} as never;
    const service = new JobsService(
      jobModel,
      quoteModel,
      dummy,
      dummy,
      helperModel,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
      dummy,
    );
    return { service, quoteModel, getQuery: () => capturedQuery };
  }

  it('(a) helper thấy báo giá accepted của chính mình (kèm pending)', async () => {
    const acceptedQuote = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      helper_id: helperId,
      status: 'accepted',
      total_price: 70000,
    };
    const pendingQuote = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      helper_id: helperId,
      status: 'pending',
      total_price: 80000,
    };
    const { service, getQuery } = buildService([acceptedQuote, pendingQuote]);

    const quotes = await service.getJobQuotes(jobId, helperId, 'helper');

    expect(getQuery().status).toEqual({ $in: expect.arrayContaining(['pending', 'accepted']) });
    expect(quotes).toHaveLength(2);
    expect(quotes.map((q: any) => q.status).sort()).toEqual(['accepted', 'pending']);
  });

  it('(b) helper vẫn chỉ thấy báo giá của chính mình, không thấy của thợ khác', async () => {
    const mineAccepted = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      helper_id: helperId,
      status: 'accepted',
      total_price: 70000,
    };
    const othersAccepted = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      helper_id: otherHelperId,
      status: 'accepted',
      total_price: 90000,
    };
    const { service, getQuery } = buildService([mineAccepted, othersAccepted]);

    const quotes = await service.getJobQuotes(jobId, helperId, 'helper');

    expect(String(getQuery().helper_id)).toBe(helperId);
    expect(quotes).toHaveLength(1);
    expect(String((quotes[0] as any).helper_id)).toBe(helperId);
  });

  it('(c) phía customer không đổi: vẫn thấy pending/rejected/accepted', async () => {
    const acceptedQuote = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      helper_id: helperId,
      status: 'accepted',
      total_price: 70000,
    };
    const { service, getQuery } = buildService([acceptedQuote]);

    const quotes = await service.getJobQuotes(jobId, customerId, 'customer');

    expect(getQuery().status).toEqual({
      $in: expect.arrayContaining(['pending', 'rejected', 'accepted']),
    });
    expect(quotes).toHaveLength(1);
    expect((quotes[0] as any).status).toBe('accepted');
  });
});

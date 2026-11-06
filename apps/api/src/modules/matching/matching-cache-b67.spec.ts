import { Types } from 'mongoose';
import { MatchingCacheService } from './matching-cache.service';
import { MatchingService } from './matching.service';
import { VerificationStatus } from '@homemate/types';

/** Spec B67: cache Redis (fallback bộ nhớ) cho gợi ý thợ, TTL 5 phút, xoá khi đơn đổi. */
describe('MatchingCacheService (B67)', () => {
  function makeCache() {
    // configService trả undefined → không có Redis → dùng bộ nhớ trong tiến trình
    return new MatchingCacheService({ get: jest.fn(() => undefined) } as never);
  }

  it('set → get trả đúng giá trị; chưa set → null', async () => {
    const cache = makeCache();
    await expect(cache.get('jobA', 10)).resolves.toBeNull();
    await cache.set('jobA', 10, [{ helper: 'Thợ 1' }]);
    await expect(cache.get('jobA', 10)).resolves.toEqual([{ helper: 'Thợ 1' }]);
  });

  it('cache phân biệt theo limit: limit 5 và limit 10 là 2 key khác nhau', async () => {
    const cache = makeCache();
    await cache.set('jobA', 10, [{ helper: 'top10' }]);
    await cache.set('jobA', 5, [{ helper: 'top5' }]);
    await expect(cache.get('jobA', 10)).resolves.toEqual([{ helper: 'top10' }]);
    await expect(cache.get('jobA', 5)).resolves.toEqual([{ helper: 'top5' }]);
  });

  it('invalidateJob xoá mọi limit của đơn đó, đơn khác còn nguyên', async () => {
    const cache = makeCache();
    await cache.set('jobA', 10, [1]);
    await cache.set('jobA', 5, [2]);
    await cache.set('jobB', 10, [3]);
    await cache.invalidateJob('jobA');
    await expect(cache.get('jobA', 10)).resolves.toBeNull();
    await expect(cache.get('jobA', 5)).resolves.toBeNull();
    await expect(cache.get('jobB', 10)).resolves.toEqual([3]);
  });
});

describe('MatchingService cache integration (B67)', () => {
  const customerId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  function makeService() {
    const job: any = {
      _id: jobId,
      customer_id: customerId,
      title: 'Dọn nhà',
      address: { district: 'Hải Châu', city: 'Đà Nẵng' },
      service_id: null,
    };
    const jobModel: any = {
      findById: jest.fn(() => ({
        populate: jest.fn(() => ({ exec: async () => job })),
      })),
    };
    const helperModel: any = {
      find: jest.fn(() => ({
        populate: jest.fn(() => ({
          exec: async () => [
            {
              _id: new Types.ObjectId(),
              user_id: { _id: new Types.ObjectId(), full_name: 'Thợ 1', phone: '0900' },
              rating: 5,
              verification_status: VerificationStatus.APPROVED,
              service_ids: [],
            },
          ],
        })),
      })),
    };
    const cache = new MatchingCacheService({ get: jest.fn(() => undefined) } as never);
    const service = new MatchingService(
      jobModel,
      helperModel,
      {} as never,
      {} as never,
      cache as never,
    );
    return { service, helperModel };
  }

  it('gọi 2 lần liên tiếp → chỉ tính 1 lần (lần 2 trả cache)', async () => {
    const { service, helperModel } = makeService();
    const first = await service.findOptimalHelpersForJob(String(jobId), String(customerId));
    const second = await service.findOptimalHelpersForJob(String(jobId), String(customerId));
    expect(first).toEqual(second);
    expect(helperModel.find).toHaveBeenCalledTimes(1);
  });

  it('invalidate xong → gọi lại tính lại từ đầu', async () => {
    const { service, helperModel } = makeService();
    await service.findOptimalHelpersForJob(String(jobId), String(customerId));
    await service.invalidateOptimalHelpersCache(String(jobId));
    await service.findOptimalHelpersForJob(String(jobId), String(customerId));
    expect(helperModel.find).toHaveBeenCalledTimes(2);
  });
});

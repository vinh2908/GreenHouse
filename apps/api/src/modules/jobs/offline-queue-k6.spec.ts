import { queryClient } from '../../../../../apps/mobile/services/query-client';

let mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage[key] ?? null),
    setItem: jest.fn(async (key: string, val: string) => {
      mockStorage[key] = val;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete mockStorage[key];
    }),
    clear: jest.fn(async () => {
      mockStorage = {};
    }),
  },
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
  hide: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
}));

jest.mock('../../../../../apps/mobile/services/secure-storage', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockApiClientPatch = jest.fn();
jest.mock('../../../../../apps/mobile/services/api-client', () => ({
  __esModule: true,
  default: {
    patch: (...args: any[]) => mockApiClientPatch(...args),
    defaults: { baseURL: 'https://greenhouse-api.test' },
  },
}));

import {
  enqueueAction,
  rollbackOptimisticStatus,
  flushQueue,
  cacheJobDetail,
  getCachedJobDetail,
  isTimeoutError,
  isNetworkLostError,
} from '../../../../../apps/mobile/services/offline.service';

describe('K6 & N5: Offline Queue Optimistic Updates, Rollback on Conflict, and Real Code Tests', () => {
  beforeEach(() => {
    mockStorage = {};
    queryClient.clear();
    jest.clearAllMocks();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  describe('ETIMEDOUT error detection via real isTimeoutError', () => {
    it('ETIMEDOUT được nhận diện là timeout, không phải mất mạng', () => {
      const err = { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT 127.0.0.1:3000' };
      expect(isTimeoutError(err)).toBe(true);
      expect(isNetworkLostError(err)).toBe(false);
    });

    it('ECONNABORTED được nhận diện là timeout', () => {
      const err = { code: 'ECONNABORTED', message: 'timeout of 8000ms exceeded' };
      expect(isTimeoutError(err)).toBe(true);
      expect(isNetworkLostError(err)).toBe(false);
    });

    it('Mất mạng không có code timeout được nhận diện là network lost', () => {
      const err = { message: 'Network Error' };
      expect(isTimeoutError(err)).toBe(false);
      expect(isNetworkLostError(err)).toBe(true);
    });
  });

  describe('Real offline action queueing, snapshot target, and rollback on 409 conflict', () => {
    it('mất mạng → thao tác lần 1 (on_the_way) → thao tác lần 2 (arrived) cùng đơn → flush gặp 409 → rollback về trạng thái thật ban đầu (confirmed), không phải trạng thái lạc quan', async () => {
      const jobId = 'job-order-123';
      const initialJob = {
        _id: jobId,
        status: 'confirmed',
        title: 'Sửa điện thoại',
      };

      // 1. Seed ban đầu vào cache AsyncStorage và React Query
      await cacheJobDetail(initialJob as any);
      queryClient.setQueryData(['job', jobId], { ...initialJob });
      queryClient.setQueryData(['jobs', 'helper'], [{ ...initialJob }]);
      queryClient.setQueryData(['jobs', 'available'], [{ ...initialJob }]);

      // 2. Thao tác offline lần 1: on_the_way
      await enqueueAction('on_the_way', jobId);

      let cached = await getCachedJobDetail<any>(jobId);
      expect(cached?.status).toBe('helper_on_the_way');
      expect((queryClient.getQueryData(['job', jobId]) as any)?.status).toBe('helper_on_the_way');
      expect((queryClient.getQueryData(['jobs', 'available']) as any[])[0]?.status).toBe(
        'helper_on_the_way',
      );

      // 3. Thao tác offline lần 2 trên cùng đơn: arrived
      await enqueueAction('arrived', jobId);

      cached = await getCachedJobDetail<any>(jobId);
      expect(cached?.status).toBe('helper_arrived');
      expect((queryClient.getQueryData(['job', jobId]) as any)?.status).toBe('helper_arrived');
      expect((queryClient.getQueryData(['jobs', 'available']) as any[])[0]?.status).toBe(
        'helper_arrived',
      );

      // 4. Giả lập flushQueue: API server trả về lỗi xung đột 409 Conflict
      mockApiClientPatch.mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Đơn đã bị hủy' } },
      });

      await flushQueue();

      // 5. Assert: Sau rollback, trạng thái phải về đúng trạng thái thật ban đầu 'confirmed'
      // (KHÔNG được kẹt ở trạng thái lạc quan 'helper_on_the_way' của thao tác 1)
      const rolledBackCached = await getCachedJobDetail<any>(jobId);
      expect(rolledBackCached?.status).toBe('confirmed');

      const rolledBackQueryData = queryClient.getQueryData(['job', jobId]) as any;
      expect(rolledBackQueryData?.status).toBe('confirmed');

      const availableJobsQueryData = queryClient.getQueryData(['jobs', 'available']) as any[];
      expect(availableJobsQueryData[0]?.status).toBe('confirmed');
    });

    it('O5: đơn KHÔNG có trong cache AsyncStorage ở lần enqueue đầu → đọc trạng thái thật từ React Query cache và rollback đúng về trạng thái thật (quote_selected, không phải confirmed đoán mò)', async () => {
      const jobId = 'job-order-no-async-cache-789';

      // 1. AsyncStorage hoàn toàn TRỐNG cho đơn này (getCachedJobDetail trả null)
      delete mockStorage[`job_detail_${jobId}`];
      const initialCached = await getCachedJobDetail<any>(jobId);
      expect(initialCached).toBeNull();

      // 2. Trạng thái thật của đơn đang nằm trong React Query cache là 'quote_selected' (không phải 'confirmed')
      queryClient.setQueryData(['job', jobId], {
        _id: jobId,
        title: 'Đơn mới nhận chưa có AsyncStorage cache',
        status: 'quote_selected',
      });
      queryClient.setQueryData(['jobs', 'available'], [{ _id: jobId, status: 'quote_selected' }]);

      // 3. Enqueue thao tác 'on_the_way'
      await enqueueAction('on_the_way', jobId);

      // Trạng thái lạc quan được ghi thành helper_on_the_way
      const rqOptimistic = queryClient.getQueryData(['job', jobId]) as any;
      expect(rqOptimistic?.status).toBe('helper_on_the_way');

      // 4. Giả lập flush gặp lỗi xung đột 409
      mockApiClientPatch.mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Đơn đã có thay đổi khác' } },
      });

      await flushQueue();

      // 5. Assert: Phải rollback về đúng trạng thái thật trước action là 'quote_selected',
      // TUYỆT ĐỐI KHÔNG đoán mò về 'confirmed'
      const rqRolledBack = queryClient.getQueryData(['job', jobId]) as any;
      expect(rqRolledBack?.status).toBe('quote_selected');

      const cachedRolledBack = await getCachedJobDetail<any>(jobId);
      expect(cachedRolledBack?.status).toBe('quote_selected');

      const availRolledBack = queryClient.getQueryData(['jobs', 'available']) as any[];
      expect(availRolledBack[0]?.status).toBe('quote_selected');
    });

    it('P1: khi [jobs, helper] đã populate rỗng [] và đơn chỉ nằm trong [jobs, available] -> enqueue -> flush 409 -> rollback về đúng trạng thái ban đầu, không phải optimistic và không no-op', async () => {
      const jobId = 'job-p1-available-only-123';

      // 1. AsyncStorage hoàn toàn trống cho đơn này
      delete mockStorage[`job_detail_${jobId}`];

      // 2. [job, jobId] hoàn toàn trống (không có cache đơn lẻ)
      queryClient.setQueryData(['job', jobId], undefined);

      // 3. [jobs, helper] đã populate nhưng RỖNG [] -> truthy!
      queryClient.setQueryData(['jobs', 'helper'], []);

      // 4. Đơn CHỈ nằm trong [jobs, available] với status 'quote_selected'
      queryClient.setQueryData(['jobs', 'available'], [{ _id: jobId, status: 'quote_selected' }]);

      // 5. Enqueue thao tác 'on_the_way'
      await enqueueAction('on_the_way', jobId);

      // Trạng thái lạc quan được ghi thành helper_on_the_way trong [jobs, available]
      const availOptimistic = queryClient.getQueryData(['jobs', 'available']) as any[];
      expect(availOptimistic[0]?.status).toBe('helper_on_the_way');

      // 6. Giả lập flush gặp lỗi xung đột 409
      mockApiClientPatch.mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Đơn đã có thay đổi' } },
      });

      await flushQueue();

      // 7. Assert: Phải rollback về đúng trạng thái thật 'quote_selected', không bị no-op và không kẹt ở 'helper_on_the_way'
      const availRolledBack = queryClient.getQueryData(['jobs', 'available']) as any[];
      expect(availRolledBack[0]?.status).toBe('quote_selected');

      const cachedRolledBack = await getCachedJobDetail<any>(jobId);
      expect(cachedRolledBack?.status).toBe('quote_selected');
    });
  });
});

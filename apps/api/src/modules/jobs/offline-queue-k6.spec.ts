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

    it('previous_status là undefined → rollback vẫn về trạng thái mặc định "confirmed" và không bỏ qua', async () => {
      const jobId = 'job-order-456';
      await cacheJobDetail({ _id: jobId, status: 'helper_on_the_way' } as any);
      queryClient.setQueryData(['job', jobId], { _id: jobId, status: 'helper_on_the_way' });
      queryClient.setQueryData(['jobs', 'available'], [{ _id: jobId, status: 'helper_on_the_way' }]);

      // Gọi rollback với undefined
      await rollbackOptimisticStatus(jobId, undefined);

      const cached = await getCachedJobDetail<any>(jobId);
      expect(cached?.status).toBe('confirmed');

      const qData = queryClient.getQueryData(['job', jobId]) as any;
      expect(qData?.status).toBe('confirmed');

      const availData = queryClient.getQueryData(['jobs', 'available']) as any[];
      expect(availData[0]?.status).toBe('confirmed');
    });
  });
});

let mockSecureStore: Record<string, string> = {};

jest.mock('../../../../../apps/mobile/services/secure-storage', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore[key] ?? null),
  setItemAsync: jest.fn(async (key: string, val: string) => {
    mockSecureStore[key] = val;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStore[key];
  }),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
}));

const mockApiGet = jest.fn();
jest.mock('../../../../../apps/mobile/services/api-client', () => {
  class SessionExpiredError extends Error {
    constructor() {
      super('SESSION_EXPIRED');
      this.name = 'SessionExpiredError';
    }
  }
  return {
    __esModule: true,
    default: {
      get: (...args: any[]) => mockApiGet(...args),
      defaults: { baseURL: 'https://greenhouse-api.test' },
    },
    SessionExpiredError,
  };
});

import { SessionExpiredError } from '../../../../../apps/mobile/services/api-client';
import { useAuthStore } from '../../../../../apps/mobile/stores/auth.store';

describe('K5 & N5: Real Mobile Auth / Startup Token Refresh and 401/SessionExpired Classification', () => {
  beforeEach(() => {
    mockSecureStore = {};
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('giả lập logout thật (SessionExpiredError) → không retry /auth/me, đăng xuất đúng ngay lập tức', async () => {
    // 1. Seed phiên đăng nhập đã có trong SecureStore
    mockSecureStore['homemate_access_token'] = 'valid-token';
    mockSecureStore['homemate_refresh_token'] = 'valid-refresh';
    mockSecureStore['homemate_user'] = JSON.stringify({ _id: 'u1', full_name: 'Nguyen Van A' });

    // 2. Mock GET /auth/me throw SessionExpiredError (không có .response)
    mockApiGet.mockRejectedValue(new SessionExpiredError());

    // 3. Chạy loadStoredAuth thật
    await useAuthStore.getState().loadStoredAuth();

    // 4. Assert: Đã đăng xuất đúng
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();

    // 5. Assert: KHÔNG retry /auth/me (chỉ gọi 1 lần duy nhất)
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    // Fast-forward timers to ensure no delayed retry fires
    jest.runAllTimers();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('giả lập lỗi mạng trong lúc refresh → phiên sống, /auth/me được thử lại (không đăng xuất ép)', async () => {
    // 1. Seed phiên đăng nhập
    const user = { _id: 'u1', full_name: 'Nguyen Van A' };
    mockSecureStore['homemate_access_token'] = 'valid-token';
    mockSecureStore['homemate_refresh_token'] = 'valid-refresh';
    mockSecureStore['homemate_user'] = JSON.stringify(user);

    // 2. Mock GET /auth/me ném lỗi mạng
    const networkErr: any = new Error('Network Error');
    networkErr.isNetworkRefreshError = true;
    networkErr.code = 'ECONNABORTED';
    mockApiGet.mockRejectedValue(networkErr);

    // 3. Chạy loadStoredAuth thật
    await useAuthStore.getState().loadStoredAuth();

    // 4. Assert: Phiên vẫn sống, không bị đăng xuất ép
    let state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?._id).toBe('u1');
    expect(state.accessToken).toBe('valid-token');
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    // 5. Assert: Thử lại tự động qua timer (2 retries qua setTimeout async)
    await jest.advanceTimersByTimeAsync(3000);
    expect(mockApiGet).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(4500);
    expect(mockApiGet).toHaveBeenCalledTimes(3);

    // Phiên vẫn sống sau các lần retry lỗi mạng
    state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?._id).toBe('u1');
  });

  it('giả lập 401 thật từ server (có response.status = 401) → đăng xuất ngay, không retry', async () => {
    mockSecureStore['homemate_access_token'] = 'valid-token';
    mockSecureStore['homemate_refresh_token'] = 'valid-refresh';
    mockSecureStore['homemate_user'] = JSON.stringify({ _id: 'u1', full_name: 'Nguyen Van A' });

    const server401Err: any = new Error('Unauthorized');
    server401Err.response = { status: 401, data: { message: 'Token revoked' } };
    mockApiGet.mockRejectedValue(server401Err);

    await useAuthStore.getState().loadStoredAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    jest.runAllTimers();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});

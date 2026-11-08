import axios, { AxiosError, AxiosHeaders } from 'axios';

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

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
  hide: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
  },
}));

// KHÔNG mock api-client: nhập trực tiếp apiClient và SessionExpiredError thật
import apiClient, { SessionExpiredError } from '../../../../../apps/mobile/services/api-client';
import { useAuthStore } from '../../../../../apps/mobile/stores/auth.store';

describe('K5 & O5: Real Mobile apiClient Interceptor, Token Refresh, and 401/SessionExpired Classification', () => {
  let axiosPostSpy: jest.SpyInstance;
  let originalAdapter: any;

  beforeEach(() => {
    mockSecureStore = {};
    jest.clearAllMocks();
    jest.useFakeTimers();

    originalAdapter = apiClient.defaults.adapter;
    axiosPostSpy = jest.spyOn(axios, 'post');

    // Reset auth store
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (axiosPostSpy) axiosPostSpy.mockRestore();
    apiClient.defaults.adapter = originalAdapter;
  });

  it('O5(a): lỗi mạng trong lúc refresh qua api-client thật → phiên sống, /auth/me được thử lại qua authStore', async () => {
    // 1. Seed phiên đăng nhập ban đầu
    const user = { _id: 'u1', full_name: 'Nguyen Van A' };
    mockSecureStore['homemate_access_token'] = 'expired-token';
    mockSecureStore['homemate_refresh_token'] = 'valid-refresh-token';
    mockSecureStore['homemate_user'] = JSON.stringify(user);

    // 2. Adapter thật của apiClient: GET /auth/me trả về 401 Unauthorized lần đầu
    let authMeCalls = 0;
    apiClient.defaults.adapter = async (config) => {
      if (config.url?.includes('/auth/me')) {
        authMeCalls++;
        const err = new AxiosError(
          'Request failed with status code 401',
          'ERR_BAD_REQUEST',
          config,
          null,
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: { message: 'Token expired' },
          } as any,
        );
        throw err;
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    // 3. Giả lập axios.post('/auth/refresh') ném lỗi mạng (ECONNABORTED / không có response)
    const networkErr = new AxiosError('Network timeout connecting to server', 'ECONNABORTED');
    axiosPostSpy.mockRejectedValue(networkErr);

    // 4. Chạy loadStoredAuth thật
    await useAuthStore.getState().loadStoredAuth();

    // 5. Assert:
    // - refreshAccessToken bắt lỗi mạng thoáng qua, KHÔNG xóa token trong SecureStore
    expect(mockSecureStore['homemate_refresh_token']).toBe('valid-refresh-token');

    // - Phiên vẫn sống trong authStore (isAuthenticated = true)
    let state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?._id).toBe('u1');
    expect(authMeCalls).toBe(1);

    // - /auth/me được lên lịch thử lại qua setTimeout
    await jest.advanceTimersByTimeAsync(3000);
    expect(authMeCalls).toBe(2);

    await jest.advanceTimersByTimeAsync(4500);
    expect(authMeCalls).toBe(3);

    // Phiên vẫn giữ nguyên trạng thái đăng nhập sau các lần retry lỗi mạng
    state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?._id).toBe('u1');
  });

  it('O5(b): logout thật (refresh token bị từ chối 401 dứt điểm) qua api-client thật → throw SessionExpiredError, xóa token, không retry', async () => {
    // 1. Seed phiên đăng nhập
    const user = { _id: 'u1', full_name: 'Nguyen Van A' };
    mockSecureStore['homemate_access_token'] = 'expired-token';
    mockSecureStore['homemate_refresh_token'] = 'revoked-refresh-token';
    mockSecureStore['homemate_user'] = JSON.stringify(user);

    let authMeCalls = 0;
    apiClient.defaults.adapter = async (config) => {
      if (config.url?.includes('/auth/me')) {
        authMeCalls++;
        throw new AxiosError(
          'Request failed with status code 401',
          'ERR_BAD_REQUEST',
          config,
          null,
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: { message: 'Unauthorized' },
          } as any,
        );
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    // 2. Giả lập axios.post('/auth/refresh') bị từ chối 401 dứt điểm từ máy chủ
    const refresh401Err = new AxiosError(
      'Refresh token expired or revoked',
      'ERR_BAD_REQUEST',
      {} as any,
      null,
      {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {} as any,
        data: { message: 'Refresh token invalid' },
      } as any,
    );
    axiosPostSpy.mockRejectedValue(refresh401Err);

    // 3. Chạy loadStoredAuth thật
    await useAuthStore.getState().loadStoredAuth();

    // 4. Assert:
    // - refreshAccessToken phát hiện 401 → xóa cặp token trong SecureStore và ném SessionExpiredError
    expect(mockSecureStore['homemate_access_token']).toBeUndefined();
    expect(mockSecureStore['homemate_refresh_token']).toBeUndefined();

    // - authStore đăng xuất ngay lập tức
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();

    // - TUYỆT ĐỐI KHÔNG retry /auth/me (chỉ gọi 1 lần ban đầu)
    expect(authMeCalls).toBe(1);

    jest.runAllTimers();
    expect(authMeCalls).toBe(1);
  });
});

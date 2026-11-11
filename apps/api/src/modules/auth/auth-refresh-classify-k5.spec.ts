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

describe('K5 & O5 & P8: Real Mobile apiClient Interceptor, Token Refresh, and 401/SessionExpired Classification', () => {
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

  it('O5(a) & P8: lỗi mạng trong lúc refresh qua api-client thật → assert axios.post(/auth/refresh) được gọi lại khi retry, phiên được giữ', async () => {
    // 1. Seed phiên đăng nhập ban đầu
    const user = { _id: 'u1', full_name: 'Nguyen Van A' };
    mockSecureStore['homemate_access_token'] = 'expired-token';
    mockSecureStore['homemate_refresh_token'] = 'valid-refresh-token';
    mockSecureStore['homemate_user'] = JSON.stringify(user);

    // 2. Adapter thật của apiClient: GET /auth/me trả về 401 Unauthorized khi token chưa refresh
    let authMeCalls = 0;
    apiClient.defaults.adapter = async config => {
      if (config.url?.includes('/auth/me')) {
        authMeCalls++;
        if (config.headers?.Authorization === 'Bearer new-access-token-success') {
          return {
            data: { data: { _id: 'u1', full_name: 'Nguyen Van A (Fresh)' } },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
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

    // 3. Lần đầu: axios.post('/auth/refresh') ném lỗi mạng thoáng qua (ECONNABORTED)
    const networkErr = new AxiosError('Network timeout connecting to server', 'ECONNABORTED');
    axiosPostSpy.mockRejectedValueOnce(networkErr);

    // 4. Chạy loadStoredAuth thật
    await useAuthStore.getState().loadStoredAuth();

    // 5. Assert P8(a):
    // - axios.post('/auth/refresh') ĐÃ ĐƯỢC GỌI thật lần đầu với đúng refresh token
    expect(axiosPostSpy).toHaveBeenCalledTimes(1);
    expect(axiosPostSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({ refresh_token: 'valid-refresh-token' }),
      expect.any(Object),
    );

    // - refreshAccessToken bắt lỗi mạng thoáng qua, KHÔNG xóa token trong SecureStore
    expect(mockSecureStore['homemate_refresh_token']).toBe('valid-refresh-token');

    // - Phiên vẫn sống trong authStore (isAuthenticated = true)
    let state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?._id).toBe('u1');
    expect(authMeCalls).toBe(1);

    // 6. Khi mạng phục hồi ở lần retry tiếp theo:
    // Chuẩn bị mock cho lần refresh thứ 2 thành công
    axiosPostSpy.mockResolvedValueOnce({
      data: {
        data: {
          access_token: 'new-access-token-success',
          refresh_token: 'new-refresh-token-success',
        },
      },
    });

    // Thử lại lần 1 sau 3000ms
    await jest.advanceTimersByTimeAsync(3000);

    // - Assert P8(a): axios.post('/auth/refresh') ĐƯỢC GỌI LẠI lần 2
    expect(axiosPostSpy).toHaveBeenCalledTimes(2);
    // authMeCalls = 3 (lần 1 ban đầu + lần 2 retry bị 401 + lần 3 apiClient tự động replay request sau khi refresh thành công)
    expect(authMeCalls).toBe(3);

    // - Phiên được làm mới và dữ liệu mới được lưu vào SecureStore
    state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.full_name).toBe('Nguyen Van A (Fresh)');
    expect(mockSecureStore['homemate_access_token']).toBe('new-access-token-success');
    expect(mockSecureStore['homemate_refresh_token']).toBe('new-refresh-token-success');
  });

  it('O5(b) & P8: logout thật (refresh token bị từ chối 401 dứt điểm) → assert axios.post(/auth/refresh) chỉ gọi 1 lần và KHÔNG retry', async () => {
    // 1. Seed phiên đăng nhập
    const user = { _id: 'u1', full_name: 'Nguyen Van A' };
    mockSecureStore['homemate_access_token'] = 'expired-token';
    mockSecureStore['homemate_refresh_token'] = 'revoked-refresh-token';
    mockSecureStore['homemate_user'] = JSON.stringify(user);

    let authMeCalls = 0;
    apiClient.defaults.adapter = async config => {
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

    // 4. Assert P8(a):
    // - axios.post('/auth/refresh') được gọi đúng 1 lần
    expect(axiosPostSpy).toHaveBeenCalledTimes(1);
    expect(axiosPostSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({ refresh_token: 'revoked-refresh-token' }),
      expect.any(Object),
    );

    // - refreshAccessToken phát hiện 401 → xóa cặp token trong SecureStore và ném SessionExpiredError
    expect(mockSecureStore['homemate_access_token']).toBeUndefined();
    expect(mockSecureStore['homemate_refresh_token']).toBeUndefined();

    // - authStore đăng xuất ngay lập tức
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();

    // - TUYỆT ĐỐI KHÔNG retry /auth/me và KHÔNG gọi lại /auth/refresh
    expect(authMeCalls).toBe(1);

    jest.runAllTimers();
    expect(authMeCalls).toBe(1);
    expect(axiosPostSpy).toHaveBeenCalledTimes(1);
  });

  it('P8 Revert-Check: lỗi mạng thoáng qua trong lúc refresh qua api-client + auth.store thật → interceptor gắn cờ isNetworkRefreshError lên lỗi thật, phiên được giữ', async () => {
    // 1. Seed phiên đăng nhập ban đầu
    const user = { _id: 'u1', full_name: 'Nguyen Van A' };
    mockSecureStore['homemate_access_token'] = 'expired-token';
    mockSecureStore['homemate_refresh_token'] = 'valid-refresh-token';
    mockSecureStore['homemate_user'] = JSON.stringify(user);

    // 2. Adapter thật của apiClient: GET /auth/me luôn trả 401 khi token chưa refresh
    apiClient.defaults.adapter = async config => {
      if (config.url?.includes('/auth/me')) {
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

    // 3. axios.post('/auth/refresh') luôn ném lỗi mạng thoáng qua (ECONNABORTED, không có response)
    const networkErr = new AxiosError('Network timeout connecting to server', 'ECONNABORTED');
    axiosPostSpy.mockRejectedValue(networkErr);

    // 4a. Gọi apiClient THẬT: interceptor thật chạy refreshAccessToken thật
    //     (axios.post('/auth/refresh') ném lỗi mạng) rồi reject với chính lỗi đó.
    let caught: any = null;
    try {
      await apiClient.get('/auth/me');
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();

    // - Lỗi reject ra là đúng lỗi mạng thoáng qua, KHÔNG phải SessionExpiredError
    expect(caught).not.toBeInstanceOf(SessionExpiredError);
    expect(caught.code).toBe('ECONNABORTED');
    // - ĐÂY LÀ REVERT-CHECK: interceptor thật PHẢI gắn cờ isNetworkRefreshError
    //   lên chính lỗi này. Xóa dòng `isNetworkRefreshError = true` khỏi
    //   interceptor thật thì assertion này FAIL (undefined !== true).
    expect((caught as any).isNetworkRefreshError).toBe(true);
    // - Pin: refresh thật đã được gọi 1 lần với đúng refresh token
    expect(axiosPostSpy).toHaveBeenCalledTimes(1);
    expect(axiosPostSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({ refresh_token: 'valid-refresh-token' }),
      expect.any(Object),
    );
    // - refresh lỗi mạng KHÔNG xóa token trong SecureStore
    expect(mockSecureStore['homemate_refresh_token']).toBe('valid-refresh-token');
    expect(mockSecureStore['homemate_access_token']).toBe('expired-token');

    // 4b. Cùng lỗi mạng đó đi qua loadStoredAuth THẬT → phân loại thật trong
    //     auth.store giữ nguyên phiên (không logout, không xóa token).
    await useAuthStore.getState().loadStoredAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?._id).toBe('u1');
    expect(state.accessToken).toBe('expired-token');
    expect(state.refreshToken).toBe('valid-refresh-token');
    expect(mockSecureStore['homemate_refresh_token']).toBe('valid-refresh-token');
    expect(mockSecureStore['homemate_access_token']).toBe('expired-token');
    // - Refresh được gọi thêm 1 lần nữa cho lần /auth/me trong loadStoredAuth
    expect(axiosPostSpy).toHaveBeenCalledTimes(2);
  });
});

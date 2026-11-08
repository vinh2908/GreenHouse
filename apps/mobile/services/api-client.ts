import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from '@/services/secure-storage';
import Constants from 'expo-constants';
import Toast from 'react-native-toast-message';
import { usableEndpoint } from '@/services/endpoint-config';
import { useSettingsStore } from '@/stores/settings.store';
import { mapServerErrorMessage } from '@/services/i18n';

const getBaseApiUrl = () => {
  // 1. URL cố định (tunnel / server thật): đặt EXPO_PUBLIC_API_URL trong apps/mobile/.env.
  //    Không ghi cứng IP LAN vào app.json — IP máy dev đổi theo mạng WiFi.
  const fixedUrl = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl;
  const browserHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
  if (usableEndpoint(fixedUrl, browserHost, typeof __DEV__ !== 'undefined' && __DEV__)) {
    return fixedUrl;
  }

  // 2. Dò theo debugger host của Expo Go
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:3000/api/v1`;
    }
  }

  // 3. Chạy trên trình duyệt (expo start --web)
  const webHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
  if (
    webHost &&
    (webHost.includes('vercel.app') || (webHost !== 'localhost' && webHost !== '127.0.0.1'))
  ) {
    return 'https://greenhouse-api-chb9.onrender.com/api/v1';
  }
  if (webHost) {
    return `http://${webHost}:3000/api/v1`;
  }

  return 'https://greenhouse-api-chb9.onrender.com/api/v1';
};

const API_URL = getBaseApiUrl();

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true', // Bỏ qua trang xác thực của localtunnel
  },
  timeout: 35000,
});

// Request interceptor
apiClient.interceptors.request.use(
  async config => {
    try {
      let token = await SecureStore.getItemAsync('homemate_access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // SecureStore error fallback
    }

    // Nếu gửi FormData (upload file/ảnh), gỡ Content-Type application/json để Axios/trình duyệt tự gắn boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  error => Promise.reject(error),
);

// ── Refresh token SINGLE-FLIGHT ─────────────────────────────────────────────
// Mọi request 401 đồng thời (một màn hình bắn 4–6 query lúc access token vừa
// hết hạn) dùng CHUNG một lần gọi /auth/refresh đang bay, thay vì mỗi request
// tự refresh và giẫm lên token của nhau.
export class SessionExpiredError extends Error {
  constructor() {
    super('SESSION_EXPIRED');
    this.name = 'SessionExpiredError';
  }
}

// Chưa từng có phiên nào (khách chưa đăng nhập / đã đăng xuất hẳn):
// KHÁC với hết phiên — không toast "Phiên đăng nhập hết hạn", chỉ fail
// request này để màn hình tự hiển thị trạng thái khách/trống.
export class NoSessionError extends Error {
  constructor() {
    super('NO_SESSION');
    this.name = 'NoSessionError';
  }
}

let refreshPromise: Promise<string> | null = null;

function triggerSessionExpiredLogout() {
  try {
    // Thông báo cho các tab web khác qua BroadcastChannel nếu có
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    const isBrowser =
      typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined';
    if (isBrowser && typeof g?.BroadcastChannel !== 'undefined') {
      try {
        const bc = new g.BroadcastChannel('homemate_auth_channel');
        bc.postMessage({ type: 'SESSION_EXPIRED' });
        if (typeof bc.close === 'function') bc.close();
      } catch {}
    }
  } catch {}

  try {
    const { useAuthStore } = require('@/stores/auth.store');
    void useAuthStore
      .getState()
      .logout()
      .finally(() => {
        try {
          const { router } = require('expo-router');
          router.replace('/(auth)/login');
        } catch {}
      });
  } catch {
    try {
      const { router } = require('expo-router');
      router.replace('/(auth)/login');
    } catch {}
  }
}

// Lắng nghe tín hiệu hết phiên từ tab khác trên web
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined') {
  const g = globalThis as any;
  if (typeof g.BroadcastChannel !== 'undefined') {
    try {
      const authChannel = new g.BroadcastChannel('homemate_auth_channel');
      authChannel.onmessage = (event: any) => {
        if (event.data?.type === 'SESSION_EXPIRED') {
          try {
            const { useAuthStore } = require('@/stores/auth.store');
            void useAuthStore
              .getState()
              .logout()
              .finally(() => {
                try {
                  const { router } = require('expo-router');
                  router.replace('/(auth)/login');
                } catch {}
              });
          } catch {}
        }
      };
    } catch {}
  }
}

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<string> => {
      const refreshToken = await SecureStore.getItemAsync('homemate_refresh_token');
      if (!refreshToken) {
        // Không có refresh token = chưa từng đăng nhập (khách) hoặc đã đăng
        // xuất. Đây KHÔNG phải "hết phiên" — không toast, màn hình tự xử lý
        // trạng thái khách.
        await SecureStore.deleteItemAsync('homemate_access_token');
        throw new NoSessionError();
      }
      try {
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          { refresh_token: refreshToken },
          { timeout: 35000 },
        );
        const { access_token, refresh_token: newRefreshToken } = data.data;
        await SecureStore.setItemAsync('homemate_access_token', access_token);
        if (newRefreshToken) {
          await SecureStore.setItemAsync('homemate_refresh_token', newRefreshToken);
        }
        return access_token as string;
      } catch (err) {
        const status = (err as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          // Server TỪ CHỐI dứt điểm refresh token (hết hạn/bị thu hồi) → mới
          // xóa cặp token và coi như hết phiên.
          await SecureStore.deleteItemAsync('homemate_access_token');
          await SecureStore.deleteItemAsync('homemate_refresh_token');
          throw new SessionExpiredError();
        }
        // Lỗi mạng / timeout / 5xx (vd Render cold-start): GIỮ NGUYÊN token —
        // phiên vẫn còn, request này fail nhẹ và lần thao tác sau thử lại được.
        throw err;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// M-11: Throttle toast lỗi kết nối mạng (tối đa 1 toast mỗi 30s cho cùng loại lỗi mạng)
let lastNetworkToastTime = 0;
let lastServerErrorToastTime = 0;
const TOAST_THROTTLE_MS = 30000;

// Response interceptor
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError<{ message?: string | string[]; statusCode?: number }>) => {
    const originalRequest = error.config as any;

    // ── 1. Xử lý lỗi Token 401 Unauthorized (Refresh token) ─────────────────
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        const lang = useSettingsStore.getState().language;
        if (refreshError instanceof SessionExpiredError) {
          // Chỉ toast khi user THẬT SỰ có phiên mà server từ chối refresh
          // (hết hạn/bị thu hồi). Khách chưa đăng nhập (NoSessionError) thì
          // im lặng — màn hình tự hiển thị trạng thái khách.
          Toast.show({
            type: 'error',
            text1: lang === 'en' ? 'Session expired' : 'Phiên đăng nhập hết hạn',
            text2:
              lang === 'en'
                ? 'Please log in again to continue'
                : 'Vui lòng đăng nhập lại để tiếp tục',
          });
          triggerSessionExpiredLogout();
          return Promise.reject(refreshError);
        }
        // K5: Lỗi refresh thoáng qua (mạng/5xx): không toast hết phiên, không xóa
        // token — chỉ fail request này với refreshError và gắn cờ mạng để phân biệt với 401 thật
        if (refreshError && typeof refreshError === 'object') {
          (refreshError as any).isNetworkRefreshError = true;
        }
        return Promise.reject(refreshError);
      }
    }

    // ── 2. Xử lý lỗi mất kết nối mạng / Timeout / Server lỗi ─────────────────
    const lang = useSettingsStore.getState().language;
    // G6: Tự động dịch lỗi máy chủ nếu client đang ở chế độ tiếng Anh cho mọi catch site
    if (error.response?.data?.message) {
      if (typeof error.response.data.message === 'string') {
        error.response.data.message = mapServerErrorMessage(error.response.data.message, lang);
      } else if (Array.isArray(error.response.data.message)) {
        error.response.data.message = error.response.data.message.map((m: unknown) =>
          typeof m === 'string' ? mapServerErrorMessage(m, lang) : String(m),
        );
      }
    }
    const now = Date.now();
    if (!error.response) {
      if (now - lastNetworkToastTime > TOAST_THROTTLE_MS) {
        lastNetworkToastTime = now;
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          Toast.show({
            type: 'error',
            text1: lang === 'en' ? 'Request timed out' : 'Yêu cầu quá hạn',
            text2:
              lang === 'en'
                ? 'Server response timed out. Please check your connection.'
                : 'Máy chủ phản hồi chậm. Vui lòng kiểm tra lại kết nối mạng.',
          });
        } else {
          Toast.show({
            type: 'error',
            text1: lang === 'en' ? 'Server connection lost' : 'Mất kết nối máy chủ',
            text2:
              lang === 'en'
                ? 'Unable to connect to the system. Please check WiFi/4G.'
                : 'Không thể kết nối đến hệ thống. Vui lòng kiểm tra WiFi/4G.',
          });
        }
      }
    } else if (error.response.status >= 500) {
      if (now - lastServerErrorToastTime > TOAST_THROTTLE_MS) {
        lastServerErrorToastTime = now;
        Toast.show({
          type: 'error',
          text1: lang === 'en' ? 'Server busy' : 'Máy chủ bận',
          text2:
            lang === 'en'
              ? 'System is processing or under maintenance. Please try again shortly.'
              : 'Hệ thống đang xử lý hoặc bảo trì. Vui lòng thử lại sau giây lát.',
        });
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;

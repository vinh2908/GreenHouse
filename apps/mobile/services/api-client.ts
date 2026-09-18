import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import Toast from 'react-native-toast-message';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000/api/v1';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
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
    return config;
  },
  error => Promise.reject(error),
);

// Response interceptor
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError<{ message?: string | string[]; statusCode?: number }>) => {
    const originalRequest = error.config as any;

    // ── 1. Xử lý lỗi Token 401 Unauthorized (Refresh token) ─────────────────
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('homemate_refresh_token');
        if (refreshToken) {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });
          const { access_token } = data.data;
          await SecureStore.setItemAsync('homemate_access_token', access_token);
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return apiClient(originalRequest);
        }
      } catch {
        await SecureStore.deleteItemAsync('homemate_access_token');
        await SecureStore.deleteItemAsync('homemate_refresh_token');
      }
      Toast.show({
        type: 'error',
        text1: 'Phiên đăng nhập hết hạn',
        text2: 'Vui lòng đăng nhập lại để tiếp tục',
      });
    }

    // ── 2. Xử lý lỗi mất kết nối mạng / Timeout / Server lỗi ─────────────────
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        Toast.show({
          type: 'error',
          text1: 'Yêu cầu quá hạn',
          text2: 'Máy chủ phản hồi chậm. Vui lòng kiểm tra lại kết nối mạng.',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Mất kết nối máy chủ',
          text2: 'Không thể kết nối đến hệ thống. Vui lòng kiểm tra WiFi/4G.',
        });
      }
    } else if (error.response.status >= 500) {
      Toast.show({
        type: 'error',
        text1: 'Máy chủ bận',
        text2: 'Hệ thống đang xử lý hoặc bảo trì. Vui lòng thử lại sau giây lát.',
      });
    }

    return Promise.reject(error);
  },
);

export default apiClient;

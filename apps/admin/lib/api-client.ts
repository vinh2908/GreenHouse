import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://greenhouse-api-chb9.onrender.com/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach token
apiClient.interceptors.request.use(
  config => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  error => Promise.reject(error),
);

// Single-flight refresh token promise for Admin
let refreshPromise: Promise<string> | null = null;

function refreshAdminToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<string> => {
      const refreshToken =
        typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
      if (!refreshToken) {
        throw new Error('NO_REFRESH_TOKEN');
      }
      try {
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          { refresh_token: refreshToken },
          { timeout: 35000 },
        );
        const { access_token, refresh_token: newRefreshToken } = data.data;
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', access_token);
          if (newRefreshToken) {
            localStorage.setItem('refresh_token', newRefreshToken);
          }
        }
        try {
          useAuthStore.getState().setTokens(access_token, newRefreshToken || refreshToken);
        } catch {}
        return access_token as string;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401 || status === 403 || err?.message === 'NO_REFRESH_TOKEN') {
          // Token dứt điểm hết hạn / bị thu hồi -> dọn sạch storage & store và chuyển về login
          try {
            useAuthStore.getState().logout();
          } catch {}
          if (typeof window !== 'undefined') {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            if (!window.location.pathname.includes('/login')) {
              window.location.href = '/login';
            }
          }
        }
        // Lỗi mạng / timeout / 5xx: GIỮ NGUYÊN token, không logout oan
        throw err;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// Response interceptor — handle 401 single-flight
apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const accessToken = await refreshAdminToken();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;

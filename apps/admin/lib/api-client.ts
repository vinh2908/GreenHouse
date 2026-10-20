import axios from 'axios';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://greenhouse-api-chb9.onrender.com/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshInFlight: Promise<string> | null = null;
async function refreshSession() {
  const previous = localStorage.getItem('refresh_token');
  if (!previous) throw new Error('Missing refresh token');
  const { data } = await axios.post(
    `${API_URL}/auth/refresh`,
    { refresh_token: previous },
    { timeout: 20000 },
  );
  if (localStorage.getItem('refresh_token') !== previous) throw new Error('Session changed');
  const { access_token, refresh_token } = data.data;
  const { useAuthStore } = await import('@/stores/auth.store');
  useAuthStore.getState().setTokens(access_token, refresh_token);
  return access_token as string;
}

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

// Response interceptor — handle 401
apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.startsWith('/auth/')
    ) {
      originalRequest._retry = true;
      try {
        if (!refreshInFlight)
          refreshInFlight = refreshSession().finally(() => {
            refreshInFlight = null;
          });
        const accessToken = await refreshInFlight;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (
          axios.isAxiosError(refreshError) &&
          (!refreshError.response || refreshError.response.status >= 500)
        )
          return Promise.reject(refreshError);
        const { useAuthStore } = await import('@/stores/auth.store');
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;

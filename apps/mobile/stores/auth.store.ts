import { create } from 'zustand';
import * as SecureStore from '@/services/secure-storage';
import apiClient from '@/services/api-client';
import type { IUser, UserRole } from '@homemate/types';

interface AuthState {
  user: IUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSwitchingRole: boolean;

  setAuth: (user: any, accessToken: string, refreshToken: string) => Promise<void>;
  setUser: (user: any) => void;
  switchRole: (role: any) => void;
  setSwitchingRole: (val: boolean) => void;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

const TOKEN_KEY = 'homemate_access_token';
const REFRESH_TOKEN_KEY = 'homemate_refresh_token';
const USER_KEY = 'homemate_user';
const ROLE_KEY = 'homemate_active_role';

const getInitialSyncAuth = () => {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  if (g?.localStorage) {
    try {
      const token = g.localStorage.getItem(TOKEN_KEY);
      const refresh = g.localStorage.getItem(REFRESH_TOKEN_KEY);
      const userStr = g.localStorage.getItem(USER_KEY);
      const role = g.localStorage.getItem(ROLE_KEY);
      if (token && refresh) {
        const u = userStr ? JSON.parse(userStr) : null;
        if (u && role) u.active_role = role;
        return {
          user: u,
          accessToken: token,
          refreshToken: refresh,
          isAuthenticated: true,
          isLoading: false,
        };
      }
    } catch {}
  }
  return {
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
  };
};
const initAuth = getInitialSyncAuth();

let switchingRoleTimer: any = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initAuth.user,
  accessToken: initAuth.accessToken,
  refreshToken: initAuth.refreshToken,
  isAuthenticated: initAuth.isAuthenticated,
  isLoading: initAuth.isLoading,
  isSwitchingRole: false,

  setSwitchingRole: (val: boolean) => {
    if (switchingRoleTimer) clearTimeout(switchingRoleTimer);
    set({ isSwitchingRole: val });
    if (val) {
      switchingRoleTimer = setTimeout(() => {
        set({ isSwitchingRole: false });
      }, 2500);
    }
  },

  setAuth: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    if (user) {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      if (user.active_role) {
        await SecureStore.setItemAsync(ROLE_KEY, user.active_role);
      }
    }
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },

  setUser: user => {
    if (user) {
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)).catch(() => {});
      if (user.active_role) {
        SecureStore.setItemAsync(ROLE_KEY, user.active_role).catch(() => {});
      }
    }
    set({ user });
  },

  switchRole: role => {
    if (switchingRoleTimer) clearTimeout(switchingRoleTimer);
    const user = get().user;
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    if (g?.localStorage) {
      try {
        g.localStorage.setItem(ROLE_KEY, role);
      } catch {}
    }
    if (user) {
      const updatedRoles = Array.isArray(user.roles) ? [...user.roles] : [];
      const updatedUser = { ...user, roles: updatedRoles, active_role: role };
      if (g?.localStorage) {
        try {
          g.localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
        } catch {}
      }
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser)).catch(() => {});
      SecureStore.setItemAsync(ROLE_KEY, role).catch(() => {});
      set({ user: updatedUser, isSwitchingRole: true });
    } else {
      SecureStore.setItemAsync(ROLE_KEY, role).catch(() => {});
      set({ isSwitchingRole: true });
    }
    switchingRoleTimer = setTimeout(() => {
      set({ isSwitchingRole: false });
    }, 2500);
  },

  logout: async () => {
    try {
      const refreshToken = get().refreshToken;
      const accessToken = get().accessToken;
      if (accessToken || refreshToken) {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
      }
    } catch {}
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(ROLE_KEY);
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });
    try {
      const withTimeout = <T>(p: Promise<T>, ms = 2500): Promise<T> => {
        let timer: any;
        return Promise.race([
          p,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error('SecureStore timeout')), ms);
          }),
        ]).finally(() => clearTimeout(timer));
      };

      const accessToken = await withTimeout(SecureStore.getItemAsync(TOKEN_KEY));
      const refreshToken = await withTimeout(SecureStore.getItemAsync(REFRESH_TOKEN_KEY));
      const storedUser = await withTimeout(SecureStore.getItemAsync(USER_KEY));
      const storedRole = await withTimeout(SecureStore.getItemAsync(ROLE_KEY));
      const parsedUser = storedUser ? JSON.parse(storedUser) : null;
      if (parsedUser && storedRole) {
        parsedUser.active_role = storedRole;
      }

      if (accessToken && refreshToken) {
        set({
          accessToken,
          refreshToken,
          user: parsedUser,
          isAuthenticated: true,
        });

        // K5: Gọi GET /auth/me khi mở app để làm mới thông tin phiên;
        // nếu cold start / timeout / mạng chậm thì GIỮ NGUYÊN phiên và tự thử lại sau delay;
        // chỉ đăng xuất ép khi 401 thật sự từ server (không phải lỗi mạng trong lúc refresh).
        const fetchMeWithRetry = async (retries = 2, delayMs = 3000): Promise<void> => {
          try {
            const { data } = await apiClient.get('/auth/me', { timeout: 8000 });
            if (data?.data) {
              const freshUser = data.data;
              if (storedRole) {
                freshUser.active_role = storedRole;
              }
              // B4-R2: KHÔNG ghi đè mù user đã lưu bằng object /auth/me. Bản
              // /auth/me cũ chỉ có {sub, phone, roles, active_role}, không có
              // _id — ghi đè làm mất currentUser._id sau mỗi lần mở lại app,
              // khiến isMyActiveJob luôn false và thẻ tiến độ của thợ được
              // giao không bao giờ hiện (đơn B live 2026-11-12). Merge lên
              // trên user cũ và suy _id từ sub khi bản mới không có _id; kể
              // cả khi server đã sửa thì merge này vẫn đúng và vô hại.
              const mergedUser = {
                ...parsedUser,
                ...freshUser,
                _id: freshUser._id ?? freshUser.sub ?? parsedUser?._id,
              };
              await SecureStore.setItemAsync(USER_KEY, JSON.stringify(mergedUser));
              set({ user: mergedUser });
            }
          } catch (err: any) {
            // N5: Phân loại đúng SessionExpiredError / 401 thật TRƯỚC khi check !response
            const isSessionExpired =
              err?.name === 'SessionExpiredError' ||
              (err?.response?.status === 401 && !err?.isNetworkRefreshError);

            if (isSessionExpired) {
              // Token thật sự hết hạn hoặc bị từ chối bởi server: đăng xuất ngay, không retry
              await SecureStore.deleteItemAsync(TOKEN_KEY);
              await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
              await SecureStore.deleteItemAsync(USER_KEY);
              await SecureStore.deleteItemAsync(ROLE_KEY);
              set({
                user: null,
                accessToken: null,
                refreshToken: null,
                isAuthenticated: false,
              });
              return;
            }

            const isNetworkError =
              err?.isNetworkRefreshError ||
              !err?.response ||
              err?.code === 'ECONNABORTED' ||
              err?.message?.includes('Network Error') ||
              err?.message?.includes('timeout') ||
              (err?.response?.status && err.response.status >= 500);

            // Cold start / timeout / mạng chậm / refresh lỗi mạng: GIỮ NGUYÊN phiên đã lưu từ SecureStore
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.warn(
                '[Startup] GET /auth/me failed transiently or cold-starting — retaining local session',
              );
            }
            if (retries > 0) {
              setTimeout(() => {
                fetchMeWithRetry(retries - 1, delayMs * 1.5).catch(() => {});
              }, delayMs);
            }
          }
        };

        await fetchMeWithRetry(2, 3000);
      } else {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      }
    } catch {
      // M-20: Khi SecureStore timeout thoáng qua, không tự ý set logged-out nếu đã có token từ initAuth
      const current = get();
      if (!current.accessToken) {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },
}));

// S4: Đồng bộ trạng thái đăng nhập / đăng xuất giữa các tab web qua storage event
const gEnv = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
if (gEnv?.window && typeof gEnv.window.addEventListener === 'function') {
  gEnv.window.addEventListener('storage', (event: any) => {
    if (
      event?.key === TOKEN_KEY ||
      event?.key === REFRESH_TOKEN_KEY ||
      event?.key === USER_KEY ||
      event?.key === null // storage.clear() fires with key === null
    ) {
      const token = gEnv?.localStorage?.getItem(TOKEN_KEY);
      const refresh = gEnv?.localStorage?.getItem(REFRESH_TOKEN_KEY);
      const userStr = gEnv?.localStorage?.getItem(USER_KEY);
      const role = gEnv?.localStorage?.getItem(ROLE_KEY);

      if (!token || !refresh) {
        // Tab khác đã đăng xuất -> đồng bộ logout trên tab này
        useAuthStore.setState({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      } else {
        // Tab khác đã đăng nhập hoặc refresh token -> đồng bộ phiên mới
        let parsedUser: any = null;
        try {
          parsedUser = userStr ? JSON.parse(userStr) : null;
          if (parsedUser && role) parsedUser.active_role = role;
        } catch {}

        useAuthStore.setState({
          user: parsedUser,
          accessToken: token,
          refreshToken: refresh,
          isAuthenticated: true,
        });
      }
    }
  });
}

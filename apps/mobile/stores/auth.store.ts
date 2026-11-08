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
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('SecureStore timeout')), 2500),
      );
      const accessToken = await Promise.race([SecureStore.getItemAsync(TOKEN_KEY), timeoutPromise]);
      const refreshToken = await Promise.race([
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        timeoutPromise,
      ]);
      const storedUser = await Promise.race([SecureStore.getItemAsync(USER_KEY), timeoutPromise]);
      const storedRole = await Promise.race([SecureStore.getItemAsync(ROLE_KEY), timeoutPromise]);
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

        // H13: Gọi GET /auth/me khi mở app để làm mới thông tin phiên;
        // nếu cold start / timeout / mạng chậm thì GIỮ NGUYÊN phiên, không đăng xuất ép.
        try {
          const { data } = await apiClient.get('/auth/me', { timeout: 8000 });
          if (data?.data) {
            const freshUser = data.data;
            if (storedRole) {
              freshUser.active_role = storedRole;
            }
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(freshUser));
            set({ user: freshUser });
          }
        } catch (err: any) {
          if (err?.response?.status === 401) {
            // Token thật sự hết hạn hoặc bị từ chối bởi server
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
          } else {
            // Cold start / timeout / mạng chậm: GIỮ NGUYÊN phiên đã lưu từ SecureStore
            if (__DEV__) {
              console.warn(
                '[Startup] GET /auth/me timed out or cold-starting — retaining local session',
              );
            }
          }
        }
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
        let parsedUser = null;
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

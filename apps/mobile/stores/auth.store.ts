import { create } from 'zustand';
import * as SecureStore from '@/services/secure-storage';
import type { IUser, UserRole } from '@homemate/types';

interface AuthState {
  user: IUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: any, accessToken: string, refreshToken: string) => Promise<void>;
  setUser: (user: any) => void;
  switchRole: (role: any) => void;
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
        return { user: u, accessToken: token, refreshToken: refresh, isAuthenticated: true, isLoading: false };
      }
    } catch {}
  }
  return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isLoading: true };
};
const initAuth = getInitialSyncAuth();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initAuth.user,
  accessToken: initAuth.accessToken,
  refreshToken: initAuth.refreshToken,
  isAuthenticated: initAuth.isAuthenticated,
  isLoading: initAuth.isLoading,

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
    const user = get().user;
    if (user) {
      const updatedRoles = Array.isArray(user.roles) ? [...user.roles] : [];
      if (!updatedRoles.includes(role)) {
        updatedRoles.push(role);
      }
      const updatedUser = { ...user, roles: updatedRoles, active_role: role };
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser)).catch(() => {});
      SecureStore.setItemAsync(ROLE_KEY, role).catch(() => {});
      set({ user: updatedUser });
    } else {
      SecureStore.setItemAsync(ROLE_KEY, role).catch(() => {});
    }
  },

  logout: async () => {
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
      } else {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      }
    } catch {
      // Token load failed — stay logged out
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      });
    } finally {
      set({ isLoading: false });
    }
  },
}));

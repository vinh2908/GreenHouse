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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    if (user) {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    }
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },

  setUser: user => {
    if (user) {
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)).catch(() => {});
    }
    set({ user });
  },

  switchRole: role => {
    const user = get().user;
    if (user && user.roles.includes(role)) {
      const updatedUser = { ...user, active_role: role };
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser)).catch(() => {});
      set({ user: updatedUser });
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });
    try {
      const accessToken = await SecureStore.getItemAsync(TOKEN_KEY);
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      const storedUser = await SecureStore.getItemAsync(USER_KEY);
      const parsedUser = storedUser ? JSON.parse(storedUser) : null;

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

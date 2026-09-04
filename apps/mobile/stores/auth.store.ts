import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { IUser, UserRole } from '@homemate/types';

interface AuthState {
  user: IUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: IUser, accessToken: string, refreshToken: string) => Promise<void>;
  setUser: (user: IUser) => void;
  switchRole: (role: UserRole) => void;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

const TOKEN_KEY = 'homemate_access_token';
const REFRESH_TOKEN_KEY = 'homemate_refresh_token';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },

  setUser: user => {
    set({ user });
  },

  switchRole: role => {
    const user = get().user;
    if (user && user.roles.includes(role)) {
      set({ user: { ...user, active_role: role } });
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });
    try {
      const accessToken = await SecureStore.getItemAsync(TOKEN_KEY);
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (accessToken && refreshToken) {
        set({ accessToken, refreshToken });
        // TODO: validate token and fetch user profile
      }
    } catch {
      // Token load failed — stay logged out
    } finally {
      set({ isLoading: false });
    }
  },
}));

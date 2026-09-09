'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/api-client';

interface AdminUser {
  _id: string;
  full_name: string;
  phone: string;
  email?: string;
  roles: string[];
}

interface AuthState {
  user: AdminUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (access: string, refresh: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (phone: string, password: string) => {
        const { data } = await apiClient.post('/auth/login', { phone, password });
        const { access_token, refresh_token, user } = data.data;

        // Verify admin role
        if (!user.roles.includes('admin')) {
          throw new Error('Tài khoản không có quyền admin');
        }

        set({
          user,
          accessToken: access_token,
          refreshToken: refresh_token,
          isAuthenticated: true,
        });

        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);
        }
      },

      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      },

      setTokens: (access: string, refresh: string) => {
        set({ accessToken: access, refreshToken: refresh });
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', access);
          localStorage.setItem('refresh_token', refresh);
        }
      },
    }),
    {
      name: 'homemate-admin-auth',
      partialize: state => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { apiClient } from '@/lib/api-client';
import { DashboardLayout } from '@/components/common/dashboard-layout';
import { Loading } from '@/components/ui';

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, accessToken, user, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [verified, setVerified] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    setNetworkError(false);
    const token =
      accessToken || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);
    if (!token) {
      router.replace('/login');
      return;
    }
    // B7 & B19: kiểm tra lại vai trò admin ở layout qua /auth/me.
    // Nếu lỗi mạng / 5xx thì báo không kết nối được máy chủ thay vì cho vào mù quáng.
    let cancelled = false;
    apiClient
      .get('/auth/me')
      .then(({ data }) => {
        if (cancelled) return;
        const roles: string[] = data?.data?.roles ?? data?.data?.user?.roles ?? [];
        const isAdmin = roles.includes('admin');
        if (!isAdmin) {
          logout();
          router.replace('/login');
        } else {
          setVerified(true);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          logout();
          router.replace('/login');
        } else {
          // Lỗi mạng hoặc 5xx máy chủ không reachable -> hiện màn hình thử lại
          setNetworkError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, accessToken, router, retryCount]);

  if (networkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full bg-card rounded-xl border p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold">Không thể kết nối máy chủ</h2>
          <p className="text-sm text-muted-foreground">
            Hệ thống không thể liên lạc với máy chủ API. Vui lòng kiểm tra kết nối mạng hoặc thử lại
            sau giây lát.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={() => {
                setNetworkError(false);
                setRetryCount(c => c + 1);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Thử lại
            </button>
            <button
              onClick={() => {
                logout();
                router.replace('/login');
              }}
              className="px-4 py-2 border text-sm font-medium rounded-lg hover:bg-muted transition-colors"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!mounted || !verified) {
    return <Loading />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

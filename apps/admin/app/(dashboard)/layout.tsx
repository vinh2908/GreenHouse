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

  useEffect(() => {
    setMounted(true);
    const token =
      accessToken || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);
    if (!token) {
      router.replace('/login');
      return;
    }
    // B7: kiểm tra lại vai trò admin ở layout (không chỉ tin token có mặt).
    // Ưu tiên kiểm chứng từ server qua /auth/me; nếu không gọi được thì đối
    // chiếu role đã lưu trong store. Token không phải admin → đăng xuất + về login.
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
      .catch(() => {
        if (cancelled) return;
        // Server không trả lời: dùng role đã lưu; không có role admin thì chặn.
        if (user?.roles?.includes('admin')) {
          setVerified(true);
        } else {
          logout();
          router.replace('/login');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, accessToken, router]);

  if (!mounted || !verified) {
    return <Loading />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

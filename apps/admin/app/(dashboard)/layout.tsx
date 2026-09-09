'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { DashboardLayout } from '@/components/common/dashboard-layout';
import { Loading } from '@/components/ui';

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, accessToken } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);
    if (!token) {
      router.replace('/login');
    }
  }, [isAuthenticated, accessToken, router]);

  if (!mounted) {
    return <Loading />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

import type { Metadata } from 'next';
import { DashboardLayout } from '@/components/common/dashboard-layout';

export const metadata: Metadata = { title: 'Dashboard | HomeMate Admin' };

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

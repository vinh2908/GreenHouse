'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Briefcase,
  CreditCard,
  BarChart3,
  Star,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

const navItems = [
  { href: '/', label: 'Tổng quan Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Quản lý Người dùng', icon: Users },
  { href: '/helpers', label: 'Đối tác Thợ & Giúp việc', icon: UserCheck },
  { href: '/helpers/kyc', label: 'Duyệt e-KYC Thợ', icon: ShieldCheck },
  { href: '/jobs', label: 'Quản lý Đơn hàng', icon: Briefcase },
  { href: '/payments', label: 'Thanh toán & Rút tiền', icon: CreditCard },
  { href: '/reviews', label: 'Đánh giá & Phản hồi', icon: Star },
  { href: '/analytics', label: 'Thống kê & Báo cáo', icon: BarChart3 },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md">
              <span className="text-primary-foreground font-black text-lg">G</span>
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight">Green House</span>
              <p className="text-xs text-muted-foreground">Admin Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === '/'
                ? pathname === '/'
                : pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User profile & Logout footer */}
        <div className="p-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{user?.full_name || 'Admin System'}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.phone || '0999999999'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Đăng xuất"
              className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Green House v1.0.0 • Production Ready
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-muted/20">
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

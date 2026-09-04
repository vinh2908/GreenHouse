'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Briefcase,
  ShoppingCart,
  CreditCard,
  BarChart3,
  Settings,
  Bell,
  Tag,
  AlertTriangle,
  Star,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Khách hàng', icon: Users },
  { href: '/helpers', label: 'Người giúp việc', icon: UserCheck },
  { href: '/services', label: 'Dịch vụ', icon: Briefcase },
  { href: '/bookings', label: 'Đơn hàng', icon: ShoppingCart },
  { href: '/payments', label: 'Thanh toán', icon: CreditCard },
  { href: '/promotions', label: 'Khuyến mãi', icon: Tag },
  { href: '/reviews', label: 'Đánh giá', icon: Star },
  { href: '/disputes', label: 'Khiếu nại', icon: AlertTriangle },
  { href: '/notifications', label: 'Thông báo', icon: Bell },
  { href: '/analytics', label: 'Thống kê', icon: BarChart3 },
  { href: '/settings', label: 'Cài đặt', icon: Settings },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">H</span>
            </div>
            <span className="font-bold text-lg">HomeMate</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Admin Dashboard</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t">
          <p className="text-xs text-muted-foreground">v1.0.0 — Phase 1</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

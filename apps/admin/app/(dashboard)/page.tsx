'use client';

import Link from 'next/link';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Users, UserCheck, Briefcase, TrendingUp } from 'lucide-react';
import {
  useDashboardStats,
  useAnalyticsSummary,
  useJobsPerDay,
  useJobsByStatus,
  useRevenuePerMonth,
  useTopHelpers,
} from '@/hooks/use-admin';
import { StatCard, Card, CardHeader, CardTitle, CardContent, Loading } from '@/components/ui';
import { formatVND } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  open: '#3b82f6',
  receiving_quotes: '#8b5cf6',
  quote_selected: '#6366f1',
  confirmed: '#f59e0b',
  helper_on_the_way: '#f97316',
  helper_arrived: '#eab308',
  in_progress: '#22c55e',
  pending_review: '#06b6d4',
  completed: '#10b981',
  cancelled: '#ef4444',
  disputed: '#dc2626',
  expired: '#64748b',
  refunded: '#a855f7',
};

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#f97316', '#22c55e', '#ef4444', '#10b981'];

const STATUS_VI: Record<string, string> = {
  draft: 'Nháp',
  open: 'Mở',
  receiving_quotes: 'Nhận báo giá',
  quote_selected: 'Đã chọn báo giá',
  confirmed: 'Đã xác nhận',
  helper_on_the_way: 'Thợ trên đường',
  helper_arrived: 'Thợ đã đến',
  in_progress: 'Đang làm',
  pending_review: 'Chờ nghiệm thu',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  disputed: 'Tranh chấp',
  expired: 'Đã hết hạn',
  refunded: 'Đã hoàn tiền',
};

export default function DashboardPage() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useDashboardStats();
  const { data: summary, isError: summaryError, refetch: refetchSummary } = useAnalyticsSummary();
  const { data: jobsPerDay, isError: jobsPerDayError } = useJobsPerDay(30);
  const { data: jobsByStatus, isError: jobsByStatusError } = useJobsByStatus();
  const { data: revenuePerMonth, isError: revenueError } = useRevenuePerMonth(6);
  const { data: topHelpers, isError: topHelpersError } = useTopHelpers();

  if (statsLoading) return <Loading />;

  if (statsError || summaryError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-destructive font-medium">Không thể tải dữ liệu thống kê tổng quan</p>
        <button
          onClick={() => {
            refetchStats();
            refetchSummary();
          }}
          className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Tổng quan hệ thống Green House</p>
      </div>

      {/* A77, C08, C12: Đếm số việc chờ xử lý kèm link và responsive flex-wrap */}
      {Number((stats as any)?.pending_actions_count || 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 font-bold text-amber-800 text-sm">
              {(stats as any)?.pending_actions_count}
            </span>
            <div>
              <p className="font-semibold text-sm">
                {(stats as any)?.pending_actions_count} việc đang chờ Admin xử lý
              </p>
              <div className="text-xs text-amber-700 flex flex-wrap gap-x-2 gap-y-1 mt-0.5">
                <Link href="/jobs?status=receiving_quotes" className="hover:underline font-medium">
                  {(stats as any)?.jobs?.pending ?? 0} đơn chờ báo giá
                </Link>
                <span>•</span>
                <Link href="/disputes" className="hover:underline font-medium">
                  {(stats as any)?.jobs?.disputed ?? 0} tranh chấp
                </Link>
                <span>•</span>
                <Link href="/helpers/kyc" className="hover:underline font-medium">
                  {(stats as any)?.helpers?.pending_kyc ?? 0} hồ sơ e-KYC
                </Link>
                <span>•</span>
                <Link href="/payments?status=pending" className="hover:underline font-medium">
                  {(stats as any)?.pending_withdrawals ?? 0} yêu cầu rút tiền
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng người dùng"
          value={stats?.users?.total?.toLocaleString('vi-VN') ?? 0}
          description={`+${summary?.users?.this_month ?? 0} tháng này`}
          trend={summary ? { value: summary.users.growth_pct, label: 'so tháng trước' } : undefined}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="Helper đã duyệt"
          value={stats?.helpers?.approved?.toLocaleString('vi-VN') ?? 0}
          description={`/ ${stats?.helpers?.total ?? 0} tổng số`}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <StatCard
          title="Jobs tháng này"
          value={summary?.jobs?.this_month?.toLocaleString('vi-VN') ?? 0}
          trend={summary ? { value: summary.jobs.growth_pct, label: 'so tháng trước' } : undefined}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <StatCard
          title="Doanh thu tháng này"
          value={formatVND(summary?.revenue?.this_month ?? 0)}
          trend={
            summary ? { value: summary.revenue.growth_pct, label: 'so tháng trước' } : undefined
          }
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Jobs per day */}
        <Card>
          <CardHeader>
            <CardTitle>Jobs theo ngày (30 ngày gần đây)</CardTitle>
          </CardHeader>
          <CardContent>
            {jobsPerDay?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={jobsPerDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => [v, 'Jobs']}
                    labelFormatter={l => `Ngày ${l}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : jobsPerDayError ? (
              <div className="h-[220px] flex items-center justify-center text-destructive text-sm font-medium">
                Không thể tải dữ liệu việc làm theo ngày
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue per month */}
        <Card>
          <CardHeader>
            <CardTitle>Doanh thu theo tháng</CardTitle>
          </CardHeader>
          <CardContent>
            {revenuePerMonth?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenuePerMonth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={v => (v / 1_000_000).toFixed(0) + 'M'}
                  />
                  <Tooltip formatter={(v: number) => [formatVND(v), 'Doanh thu']} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : revenueError ? (
              <div className="h-[220px] flex items-center justify-center text-destructive text-sm font-medium">
                Không thể tải dữ liệu doanh thu
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Jobs by status (Pie) */}
        <Card>
          <CardHeader>
            <CardTitle>Phân bố trạng thái Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobsByStatus?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={jobsByStatus}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ status, percent }) =>
                      `${STATUS_VI[status] ?? status}: ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {jobsByStatus.map((entry: { status: string; count: number }, index: number) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] ?? PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v, STATUS_VI[n] ?? n]} />
                </PieChart>
              </ResponsiveContainer>
            ) : jobsByStatusError ? (
              <div className="h-[220px] flex items-center justify-center text-destructive text-sm font-medium">
                Không thể tải phân bố trạng thái
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Helpers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Helpers (Jobs hoàn thành)</CardTitle>
          </CardHeader>
          <CardContent>
            {topHelpers?.length ? (
              <div className="space-y-3">
                {topHelpers
                  .slice(0, 6)
                  .map(
                    (
                      h: { full_name: string; phone: string; completed_jobs: number },
                      i: number,
                    ) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{h.full_name ?? 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">{h.phone}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-green-600">
                          {h.completed_jobs} jobs
                        </span>
                      </div>
                    ),
                  )}
              </div>
            ) : topHelpersError ? (
              <div className="h-[220px] flex items-center justify-center text-destructive text-sm font-medium">
                Không thể tải danh sách top helpers
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

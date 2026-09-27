'use client';

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
  open: '#3b82f6',
  receiving_quotes: '#8b5cf6',
  confirmed: '#f59e0b',
  helper_on_the_way: '#f97316',
  helper_arrived: '#eab308',
  in_progress: '#22c55e',
  pending_review: '#06b6d4',
  completed: '#10b981',
  cancelled: '#ef4444',
  disputed: '#dc2626',
};

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#f97316', '#22c55e', '#ef4444', '#10b981'];

const STATUS_VI: Record<string, string> = {
  open: 'Mở',
  receiving_quotes: 'Nhận báo giá',
  confirmed: 'Đã xác nhận',
  helper_on_the_way: 'Helper trên đường',
  helper_arrived: 'Helper đã đến',
  in_progress: 'Đang làm',
  pending_review: 'Chờ nghiệm thu',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  disputed: 'Tranh chấp',
};

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: summary } = useAnalyticsSummary();
  const { data: jobsPerDay } = useJobsPerDay(30);
  const { data: jobsByStatus } = useJobsByStatus();
  const { data: revenuePerMonth } = useRevenuePerMonth(6);
  const { data: topHelpers } = useTopHelpers();

  if (statsLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Tổng quan hệ thống Green House</p>
      </div>

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

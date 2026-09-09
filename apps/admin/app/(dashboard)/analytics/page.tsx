'use client';

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  useAnalyticsSummary,
  useJobsPerDay,
  useRevenuePerMonth,
  useTopHelpers,
  useJobsByStatus,
} from '@/hooks/use-admin';
import { Card, CardHeader, CardTitle, CardContent, Loading } from '@/components/ui';
import { formatVND } from '@/lib/utils';

const STATUS_VI: Record<string, string> = {
  open: 'Mở',
  receiving_quotes: 'Nhận BG',
  confirmed: 'Xác nhận',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export default function AnalyticsPage() {
  const { data: summary, isLoading } = useAnalyticsSummary();
  const { data: jobsPerDay } = useJobsPerDay(30);
  const { data: revenuePerMonth } = useRevenuePerMonth(6);
  const { data: topHelpers } = useTopHelpers();
  const { data: jobsByStatus } = useJobsByStatus();

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Thống kê & Phân tích</h1>
        <p className="text-muted-foreground">Dữ liệu thực tế từ hệ thống</p>
      </div>

      {/* Summary comparison */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: 'Jobs tháng này',
              value: summary.jobs.this_month,
              last: summary.jobs.last_month,
              growth: summary.jobs.growth_pct,
              format: (v: number) => v.toLocaleString('vi-VN'),
            },
            {
              title: 'Doanh thu tháng này',
              value: summary.revenue.this_month,
              last: summary.revenue.last_month,
              growth: summary.revenue.growth_pct,
              format: formatVND,
            },
            {
              title: 'Người dùng mới',
              value: summary.users.this_month,
              last: summary.users.last_month,
              growth: summary.users.growth_pct,
              format: (v: number) => v.toLocaleString('vi-VN'),
            },
          ].map(item => (
            <Card key={item.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{item.format(item.value)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tháng trước: {item.format(item.last)}
                </p>
                <p
                  className={`text-xs mt-1 ${item.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {item.growth >= 0 ? '▲' : '▼'} {Math.abs(item.growth)}%
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Jobs per day */}
        <Card>
          <CardHeader>
            <CardTitle>Jobs / ngày (30 ngày)</CardTitle>
          </CardHeader>
          <CardContent>
            {jobsPerDay?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={jobsPerDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
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
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue per month */}
        <Card>
          <CardHeader>
            <CardTitle>Doanh thu / tháng</CardTitle>
          </CardHeader>
          <CardContent>
            {revenuePerMonth?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revenuePerMonth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={v => (v / 1_000_000).toFixed(0) + 'M'}
                  />
                  <Tooltip formatter={(v: number) => [formatVND(v), 'Doanh thu']} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Jobs by status */}
        <Card>
          <CardHeader>
            <CardTitle>Jobs theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent>
            {jobsByStatus?.length ? (
              <div className="space-y-2">
                {jobsByStatus.map((s: { status: string; count: number }) => (
                  <div key={s.status} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-36 shrink-0">
                      {STATUS_VI[s.status] ?? s.status}
                    </span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width: `${Math.min((s.count / Math.max(...jobsByStatus.map((x: { count: number }) => x.count))) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-10 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top helpers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Helpers</CardTitle>
          </CardHeader>
          <CardContent>
            {topHelpers?.length ? (
              <div className="space-y-3">
                {topHelpers
                  .slice(0, 8)
                  .map(
                    (
                      h: { full_name: string; phone: string; completed_jobs: number },
                      i: number,
                    ) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-muted-foreground w-5">
                            {i + 1}
                          </span>
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
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Tổng quan hệ thống HomeMate</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Tổng khách hàng" value="0" description="Người dùng đã đăng ký" />
        <StatCard title="Người giúp việc" value="0" description="Helper đang hoạt động" />
        <StatCard title="Đơn hôm nay" value="0" description="Đơn đặt trong ngày" />
        <StatCard title="Doanh thu tháng" value="0₫" description="Tổng doanh thu tháng này" />
      </div>

      {/* Placeholder for charts - will be implemented in Phase 9 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Đơn hàng theo ngày</h2>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Chart sẽ được thêm ở Phase 9
          </div>
        </div>
        <div className="rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Phân bố dịch vụ</h2>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Chart sẽ được thêm ở Phase 9
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

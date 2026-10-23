'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminMonthlyContract, useAdminMonthlyContracts } from '@/hooks/use-admin';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Loading,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatDateTime, formatVND } from '@/lib/utils';

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'outline' }
> = {
  pending_helper: { label: 'Chờ thợ duyệt', variant: 'secondary' },
  active: { label: 'Đang hiệu lực', variant: 'success' },
  cancelled: { label: 'Đã hủy', variant: 'destructive' },
  ended: { label: 'Đã kết thúc', variant: 'outline' },
};

export default function AdminMonthlyContractsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminMonthlyContracts({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: 20,
  });

  const contracts = data?.contracts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hợp đồng tháng & Chấm công</h1>
          <p className="text-sm text-muted-foreground">
            Quản trị các hợp đồng giúp việc định kỳ theo tháng, theo dõi lịch chấm công & chốt lương
          </p>
        </div>
        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Tất cả trạng thái' },
              { value: 'pending_helper', label: 'Chờ thợ duyệt' },
              { value: 'active', label: 'Đang hiệu lực' },
              { value: 'ended', label: 'Đã kết thúc' },
              { value: 'cancelled', label: 'Đã hủy' },
            ]}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách Hợp đồng tháng ({data?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loading />
            </div>
          ) : !contracts.length ? (
            <EmptyState message="Không có hợp đồng tháng nào được tạo theo tiêu chí lọc này." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hợp đồng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Thợ phụ trách</TableHead>
                  <TableHead>Lương tháng</TableHead>
                  <TableHead>Khung giờ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map(c => {
                  const st = STATUS_MAP[c.status] ?? {
                    label: c.status,
                    variant: 'secondary' as const,
                  };
                  return (
                    <TableRow key={c._id}>
                      <TableCell className="font-semibold text-primary">{c.title}</TableCell>
                      <TableCell>
                        {c.customer_id ? (
                          <div>
                            <p className="font-medium">{c.customer_id.full_name || 'Khách'}</p>
                            <p className="text-xs text-muted-foreground">{c.customer_id.phone}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.helper_id ? (
                          <div>
                            <p className="font-medium">{c.helper_id.full_name || 'Thợ'}</p>
                            <p className="text-xs text-muted-foreground">{c.helper_id.phone}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold text-emerald-600">
                        {formatVND(c.monthly_amount ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.time_start || '08:00'} – {c.time_end || '12:00'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(c.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {data && data.total_pages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-xs text-muted-foreground">
                Trang {page} / {data.total_pages}
              </span>
              <div className="flex gap-2">
                <button
                  className="rounded px-3 py-1 border text-xs disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Trước
                </button>
                <button
                  className="rounded px-3 py-1 border text-xs disabled:opacity-40"
                  disabled={page >= data.total_pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

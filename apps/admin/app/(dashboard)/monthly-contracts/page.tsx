'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import {
  AdminMonthlyContract,
  useAdminMonthlyContracts,
  useAdminApproveMonthlyContract,
  useAdminCancelMonthlyContract,
  useAdminEndMonthlyContract,
} from '@/hooks/use-admin';
import {
  Badge,
  Button,
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
import { formatDate, formatDateTime, formatVND } from '@/lib/utils';
import { PromptDialog } from '@/components/common/prompt-dialog';

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Chờ thợ duyệt', variant: 'secondary' },
  pending_helper: { label: 'Chờ thợ duyệt', variant: 'secondary' },
  active: { label: 'Đang hiệu lực', variant: 'success' },
  rejected: { label: 'Đã từ chối', variant: 'destructive' },
  cancelled: { label: 'Đã hủy', variant: 'destructive' },
  ended: { label: 'Đã kết thúc', variant: 'outline' },
};

export default function AdminMonthlyContractsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useAdminMonthlyContracts({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: 20,
  });

  const contracts = data?.contracts ?? [];

  // B106: xác nhận bằng PromptDialog thay cho hộp thoại confirm của trình duyệt.
  const [confirmContract, setConfirmContract] = useState<{
    id: string;
    title: string;
    action: 'cancel' | 'end';
  } | null>(null);

  // B3: admin duyệt / hủy / kết thúc hợp đồng tháng
  const approveMutation = useAdminApproveMonthlyContract();
  const cancelMutation = useAdminCancelMonthlyContract();
  const endMutation = useAdminEndMonthlyContract();

  // B12: Xem chấm công của hợp đồng
  const [viewingContract, setViewingContract] = useState<AdminMonthlyContract | null>(null);
  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
    queryKey: ['admin', 'monthly-contract-attendance', viewingContract?._id],
    queryFn: async () => {
      const res = await apiClient.get(`/monthly-contracts/${viewingContract?._id}/attendance`);
      return res.data.data;
    },
    enabled: !!viewingContract?._id,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hợp đồng tháng & Chấm công</h1>
          <p className="text-sm text-muted-foreground">
            Danh sách hợp đồng giúp việc định kỳ theo tháng & xem lịch chấm công thợ
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
              { value: 'pending', label: 'Chờ thợ duyệt' },
              { value: 'active', label: 'Đang hiệu lực' },
              { value: 'rejected', label: 'Đã từ chối' },
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
          ) : isError ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-destructive font-medium">
                Không thể tải danh sách hợp đồng tháng. Vui lòng thử lại.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tải lại
              </Button>
            </div>
          ) : !contracts.length ? (
            <EmptyState message="Không có hợp đồng tháng nào được tạo theo tiêu chí lọc này." />
          ) : (
            <div className="overflow-x-auto w-full">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Hợp đồng</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Thợ phụ trách</TableHead>
                    <TableHead>Lương tháng</TableHead>
                    <TableHead>Khung giờ</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead>Thao tác</TableHead>
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
                        <TableCell>
                          <button
                            onClick={() => setViewingContract(c)}
                            className="text-left font-semibold text-primary hover:underline"
                          >
                            {c.title}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(c.start_date)} –{' '}
                            {c.end_date ? formatDate(c.end_date) : 'Vô thời hạn'}
                          </p>
                        </TableCell>
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
                        <TableCell>
                          <div className="flex flex-col gap-1.5 min-w-[110px]">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-primary h-7 px-2 justify-start hover:bg-primary/10"
                              onClick={() => setViewingContract(c)}
                            >
                              Xem chấm công
                            </Button>
                            {c.status === 'pending' && (
                              <Button
                                size="sm"
                                disabled={approveMutation.isPending}
                                onClick={() => approveMutation.mutate(c._id)}
                              >
                                Duyệt
                              </Button>
                            )}
                            {(c.status === 'pending' || c.status === 'active') && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={cancelMutation.isPending}
                                onClick={() =>
                                  setConfirmContract({
                                    id: c._id,
                                    title: c.title,
                                    action: 'cancel',
                                  })
                                }
                              >
                                Hủy
                              </Button>
                            )}
                            {c.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={endMutation.isPending}
                                onClick={() =>
                                  setConfirmContract({ id: c._id, title: c.title, action: 'end' })
                                }
                              >
                                Kết thúc
                              </Button>
                            )}
                            {c.status !== 'pending' && c.status !== 'active' && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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

      {confirmContract && (
        <PromptDialog
          title={confirmContract.action === 'cancel' ? 'Hủy hợp đồng' : 'Kết thúc hợp đồng'}
          message={
            confirmContract.action === 'cancel'
              ? `Hủy hợp đồng "${confirmContract.title}"?`
              : `Kết thúc hợp đồng "${confirmContract.title}"?`
          }
          confirmLabel={confirmContract.action === 'cancel' ? 'Hủy' : 'Kết thúc'}
          requireInput={false}
          onSubmit={() => {
            const target = confirmContract;
            setConfirmContract(null);
            if (target.action === 'cancel') {
              cancelMutation.mutate({ id: target.id });
            } else {
              endMutation.mutate({ id: target.id });
            }
          }}
          onClose={() => setConfirmContract(null)}
        />
      )}

      {/* B12: Modal xem chi tiết hợp đồng & chấm công */}
      {viewingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-card p-6 shadow-xl border space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold">{viewingContract.title}</h3>
                <p className="text-xs text-muted-foreground">
                  Thời hạn: {formatDate(viewingContract.start_date)} –{' '}
                  {viewingContract.end_date ? formatDate(viewingContract.end_date) : 'Vô thời hạn'}
                </p>
              </div>
              <Badge
                variant={STATUS_MAP[viewingContract.status]?.variant ?? ('secondary' as const)}
              >
                {STATUS_MAP[viewingContract.status]?.label ?? viewingContract.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 p-3 rounded-lg">
              <div>
                <span className="text-xs text-muted-foreground block">Khách hàng:</span>
                <span className="font-semibold">
                  {viewingContract.customer_id?.full_name || '—'}
                </span>
                <span className="text-xs text-muted-foreground block">
                  {viewingContract.customer_id?.phone}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Thợ:</span>
                <span className="font-semibold">{viewingContract.helper_id?.full_name || '—'}</span>
                <span className="text-xs text-muted-foreground block">
                  {viewingContract.helper_id?.phone}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Lương tháng:</span>
                <span className="font-bold text-emerald-600">
                  {formatVND(viewingContract.monthly_amount ?? 0)}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Khung giờ làm việc:</span>
                <span className="font-medium">
                  {viewingContract.time_start || '08:00'} – {viewingContract.time_end || '12:00'}
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Lịch chấm công tháng</h4>
              {attendanceLoading ? (
                <div className="py-6 flex justify-center">
                  <Loading />
                </div>
              ) : !attendanceData?.scheduled_dates?.length ? (
                <EmptyState message="Chưa có lịch chấm công nào cho tháng này." />
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ngày</TableHead>
                        <TableHead>Thợ điểm danh</TableHead>
                        <TableHead>Khách xác nhận</TableHead>
                        <TableHead>Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceData.scheduled_dates.map((dateStr: string) => {
                        const rec = (attendanceData.records ?? []).find(
                          (r: any) => r.date === dateStr,
                        );
                        return (
                          <TableRow key={dateStr}>
                            <TableCell className="font-mono text-xs">{dateStr}</TableCell>
                            <TableCell className="text-xs">
                              {rec?.checkin_time ? (
                                <span className="text-emerald-600 font-medium">
                                  {rec.checkin_time}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {rec?.customer_confirmed ? (
                                <Badge variant="success">Đã xác nhận</Badge>
                              ) : rec?.checkin_time ? (
                                <Badge variant="warning">Chờ khách duyệt</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {rec?.status === 'present' ? (
                                <span className="text-emerald-600 font-semibold">Có mặt</span>
                              ) : rec?.status === 'leave' ? (
                                <span className="text-amber-600 font-medium">Nghỉ phép</span>
                              ) : rec?.status === 'absent' ? (
                                <span className="text-destructive font-semibold">Vắng mặt</span>
                              ) : (
                                <span className="text-muted-foreground">Chưa đến lượt</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setViewingContract(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

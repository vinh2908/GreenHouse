'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminJobs, useAdminResolveDispute } from '@/hooks/use-admin';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Loading,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatDateTime, formatVND } from '@/lib/utils';

export default function DisputesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAdminJobs({
    status: 'disputed',
    page,
  });

  const resolveDispute = useAdminResolveDispute();

  const [resolvingJob, setResolvingJob] = useState<any | null>(null);
  const [action, setAction] = useState<'refund_full' | 'refund_partial' | 'release_to_helper'>(
    'refund_full',
  );
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [adminNote, setAdminNote] = useState<string>('');
  const [resolveError, setResolveError] = useState<string | null>(null);

  const jobs = data?.jobs ?? [];

  const handleOpenResolve = (job: any) => {
    setResolvingJob(job);
    setAction('refund_full');
    setRefundAmount(String(job.final_price || job.price || 0));
    setAdminNote('');
    setResolveError(null);
  };

  const handleConfirmResolve = () => {
    if (!resolvingJob) return;
    if (!adminNote.trim()) {
      setResolveError('Vui lòng nhập ghi chú phân xử');
      return;
    }

    const payload: {
      id: string;
      action: 'refund_full' | 'refund_partial' | 'release_to_helper';
      refund_amount?: number;
      admin_note: string;
    } = {
      id: resolvingJob._id,
      action,
      admin_note: adminNote.trim(),
    };

    if (action === 'refund_partial') {
      const amt = Number(refundAmount) || 0;
      if (amt <= 0) {
        setResolveError('Số tiền hoàn một phần phải lớn hơn 0₫');
        return;
      }
      payload.refund_amount = amt;
    }

    setResolveError(null);
    resolveDispute.mutate(payload, {
      onSuccess: () => {
        setResolvingJob(null);
        setAdminNote('');
        setResolveError(null);
      },
      onError: (err: any) => {
        setResolveError(
          err?.response?.data?.message || err?.message || 'Không thể giải quyết tranh chấp',
        );
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Hàng đợi Tranh chấp & Khiếu nại</h1>
        <p className="text-muted-foreground">
          Danh sách đơn hàng đang ở trạng thái tranh chấp cần quản trị viên xem xét và phân xử (
          {data?.total ?? 0} đơn)
        </p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden max-w-full">
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-destructive font-medium">Không thể tải danh sách tranh chấp</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tải lại
            </Button>
          </div>
        ) : !jobs.length ? (
          <EmptyState message="Hiện không có đơn hàng nào đang trong tình trạng tranh chấp" />
        ) : (
          <>
            <div className="overflow-x-auto w-full">
              <Table className="min-w-[750px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Đơn hàng</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Thợ</TableHead>
                    <TableHead>Số tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job: any) => (
                    <TableRow key={job._id}>
                      <TableCell>
                        <Link href={`/jobs/${job._id}`} className="font-medium hover:underline">
                          {job.title}
                        </Link>
                        <p className="text-xs text-muted-foreground font-mono">
                          Mã: {job._id.slice(-8)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {job.customer_id ? (
                          <div>
                            <Link
                              href={`/users/${job.customer_id._id}`}
                              className="font-medium hover:underline text-sm"
                            >
                              {job.customer_id.full_name || 'Khách'}
                            </Link>
                            <p className="text-xs text-muted-foreground font-mono">
                              {job.customer_id.phone}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.helper_id ? (
                          <div>
                            <Link
                              href={`/users/${job.helper_id._id}`}
                              className="font-medium hover:underline text-sm"
                            >
                              {job.helper_id.full_name || 'Thợ'}
                            </Link>
                            <p className="text-xs text-muted-foreground font-mono">
                              {job.helper_id.phone}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold text-sm">
                        {formatVND(job.final_price || job.price || 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="danger">Tranh chấp</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(job.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Link href={`/jobs/${job._id}`}>
                            <Button size="sm" variant="outline">
                              Chi tiết
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => handleOpenResolve(job)}
                          >
                            Phân xử
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalPages={data.total_pages ?? 1} onPageChange={setPage} />
          </>
        )}
      </div>

      {/* Modal phân xử tranh chấp */}
      {resolvingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl border space-y-4">
            <h3 className="text-lg font-bold">Phân xử tranh chấp đơn hàng</h3>
            <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Đơn hàng:</span>{' '}
                <span className="font-medium">{resolvingJob.title}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Giá trị đơn:</span>{' '}
                <span className="font-bold text-emerald-600">
                  {formatVND(resolvingJob.final_price || resolvingJob.price || 0)}
                </span>
              </p>
            </div>

            {resolveError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
                {resolveError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Quyết định phân xử
                </label>
                <Select
                  value={action}
                  onChange={e => setAction(e.target.value as any)}
                  options={[
                    { value: 'refund_full', label: 'Hoàn tiền 100% cho khách hàng' },
                    { value: 'refund_partial', label: 'Hoàn tiền một phần cho khách hàng' },
                    {
                      value: 'release_to_helper',
                      label: 'Bác khiếu nại, thanh toán đầy đủ cho thợ',
                    },
                  ]}
                />
              </div>

              {action === 'refund_partial' && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Số tiền hoàn cho khách (₫)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={refundAmount}
                    onChange={e => setRefundAmount(e.target.value)}
                    placeholder="Nhập số tiền hoàn..."
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Ghi chú phân xử (bắt buộc)
                </label>
                <textarea
                  className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]"
                  placeholder="Nhập lý do và cơ sở phân xử tranh chấp..."
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setResolvingJob(null);
                  setResolveError(null);
                }}
              >
                Hủy bỏ
              </Button>
              <Button
                className="bg-primary text-primary-foreground"
                loading={resolveDispute.isPending}
                onClick={handleConfirmResolve}
              >
                Xác nhận phân xử
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

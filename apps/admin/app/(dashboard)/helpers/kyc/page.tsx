'use client';

import { useState } from 'react';
import { usePendingKyc, useApproveKyc, useRejectKyc } from '@/hooks/use-admin';
import {
  Badge,
  Button,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Loading,
  EmptyState,
  Pagination,
  Card,
  CardContent,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { CheckCircle, XCircle } from 'lucide-react';

export default function KycPendingPage() {
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = usePendingKyc({ page });
  const approve = useApproveKyc();
  const reject = useRejectKyc();

  const handleReject = (userId: string) => {
    if (!rejectReason.trim()) return;
    reject.mutate({ userId, reason: rejectReason });
    setRejectingId(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">KYC chờ duyệt</h1>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{data?.total ?? 0}</span> hồ sơ đang chờ xét duyệt
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <Loading />
        ) : !data?.helpers?.length ? (
          <EmptyState message="Không có hồ sơ KYC nào chờ duyệt" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>CCCD</TableHead>
                  <TableHead>Nộp hồ sơ</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.helpers.map(
                  (h: {
                    _id: string;
                    user_id: { _id: string; full_name: string; phone: string } | null;
                    id_card_number?: string;
                    id_card_front?: string;
                    id_card_back?: string;
                    selfie_photo?: string;
                    created_at: string;
                  }) => (
                    <>
                      <TableRow key={h._id}>
                        <TableCell>
                          <p className="font-medium">{h.user_id?.full_name ?? '—'}</p>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{h.user_id?.phone ?? '—'}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {h.id_card_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(h.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-300 hover:bg-green-50"
                              loading={approve.isPending}
                              onClick={() =>
                                h.user_id && approve.mutate(h.user_id._id)
                              }
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Duyệt
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() =>
                                setRejectingId(rejectingId === h._id ? null : h._id)
                              }
                            >
                              <XCircle className="mr-1 h-3 w-3" />
                              Từ chối
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* KYC Images row */}
                      <TableRow key={`${h._id}-images`}>
                        <TableCell colSpan={5} className="py-2 px-4 bg-muted/30">
                          <div className="flex gap-3 flex-wrap">
                            {h.id_card_front && (
                              <a href={h.id_card_front} target="_blank" rel="noreferrer">
                                <div className="text-xs text-blue-600 underline">CCCD mặt trước</div>
                              </a>
                            )}
                            {h.id_card_back && (
                              <a href={h.id_card_back} target="_blank" rel="noreferrer">
                                <div className="text-xs text-blue-600 underline">CCCD mặt sau</div>
                              </a>
                            )}
                            {h.selfie_photo && (
                              <a href={h.selfie_photo} target="_blank" rel="noreferrer">
                                <div className="text-xs text-blue-600 underline">Ảnh selfie</div>
                              </a>
                            )}
                          </div>
                          {/* Reject form */}
                          {rejectingId === h._id && (
                            <div className="mt-3 flex gap-2 items-center">
                              <input
                                className="flex-1 h-8 rounded border border-input px-2 text-sm"
                                placeholder="Lý do từ chối..."
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                loading={reject.isPending}
                                onClick={() => h.user_id && handleReject(h.user_id._id)}
                              >
                                Xác nhận từ chối
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRejectingId(null);
                                  setRejectReason('');
                                }}
                              >
                                Hủy
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    </>
                  ),
                )}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={data.total_pages ?? 1} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

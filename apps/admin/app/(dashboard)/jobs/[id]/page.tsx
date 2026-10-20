'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAdminCancelJob, useAdminJob, useAdminResolveDispute } from '@/hooks/use-admin';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Loading,
  EmptyState,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { STATUS_BADGE, STATUS_VI } from '../status';
import { PhotoGrid } from '@/components/common/photo-grid';

// Statuses from which the state machine still allows a cancellation.
const CANCELLABLE = [
  'open',
  'receiving_quotes',
  'quote_selected',
  'confirmed',
  'helper_on_the_way',
];

const DISPUTE_ACTION_OPTIONS = [
  { value: 'refund_full', label: 'Hoàn tiền 100% cho Khách hàng (Thợ vi phạm)' },
  { value: 'refund_partial', label: 'Hoàn tiền một phần cho Khách & Giải ngân phần còn lại' },
  { value: 'release_to_helper', label: 'Bác khiếu nại & Giải ngân 100% cho Thợ' },
];

interface Person {
  _id?: string;
  full_name?: string;
  phone?: string;
}

interface JobEvent {
  status: string;
  note?: string;
  actor_role?: string;
  timestamp: string;
}

function PersonCard({ title, person }: { title: string; person?: Person | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      {person?._id ? (
        <Link href={`/users/${person._id}`} className="font-medium hover:underline">
          {person.full_name}
        </Link>
      ) : (
        <p className="font-medium">{person?.full_name ?? '—'}</p>
      )}
      <p className="font-mono text-sm text-muted-foreground">{person?.phone}</p>
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading, error } = useAdminJob(id);
  const cancelJob = useAdminCancelJob();
  const resolveDispute = useAdminResolveDispute();

  const [reason, setReason] = useState('');
  const [disputeAction, setDisputeAction] = useState<
    'refund_full' | 'refund_partial' | 'release_to_helper'
  >('refund_full');
  const [refundAmount, setRefundAmount] = useState('');
  const [adminNote, setAdminNote] = useState('');

  if (isLoading) return <Loading />;
  if (error || !job) return <EmptyState message="Không tìm thấy job" />;

  const canCancel = CANCELLABLE.includes(job.status);
  const isDisputed = job.status === 'disputed';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
            ← Danh sách jobs
          </Link>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-tight">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {job.service_id?.name ?? '—'} · Tạo lúc {formatDateTime(job.created_at)}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[job.status] ?? 'secondary'}>
          {STATUS_VI[job.status] ?? job.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Thông tin công việc & Bằng chứng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{job.description}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <PersonCard title="Khách hàng" person={job.customer_id} />
              <PersonCard title="Thợ" person={job.helper_id} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Địa chỉ</p>
              <p className="text-sm">{job.address?.full_address}</p>
              {job.address?.notes && (
                <p className="text-sm text-muted-foreground">Ghi chú: {job.address.notes}</p>
              )}
            </div>
            {job.is_sos && (
              <p className="text-sm">
                <Badge variant="danger">SOS</Badge> Phụ phí:{' '}
                {(job.sos_surcharge ?? 0).toLocaleString('vi-VN')} ₫
              </p>
            )}
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Ảnh hiện trạng (Trước khi làm)
              </p>
              <PhotoGrid urls={job.photos} />
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Ảnh hoàn thành (Sau khi làm)
              </p>
              <PhotoGrid urls={job.completion_photos} />
              {job.completion_notes && (
                <p className="mt-2 text-sm text-muted-foreground">{job.completion_notes}</p>
              )}
            </div>

            {job.dispute_reason && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-destructive">
                  ⚠️ Hồ sơ Khiếu nại / Tranh chấp
                </p>
                <p className="text-sm font-medium">Lý do khiếu nại: {job.dispute_reason}</p>
                {job.dispute_photos?.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">Ảnh bằng chứng sự cố:</p>
                    <PhotoGrid urls={job.dispute_photos} />
                  </div>
                )}
                {job.dispute_resolution && (
                  <div className="mt-2 border-t pt-2 text-xs space-y-1">
                    <p className="font-semibold text-foreground">
                      Phán quyết của Admin: {job.dispute_resolution.action}
                    </p>
                    <p>Ghi chú: {job.dispute_resolution.admin_note}</p>
                    {job.dispute_resolution.refund_amount > 0 && (
                      <p>
                        Đã hoàn ví Khách:{' '}
                        {job.dispute_resolution.refund_amount.toLocaleString('vi-VN')} ₫
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {job.customer_rating && (
              <p className="text-sm">
                Đánh giá của khách: <b>{job.customer_rating}★</b> {job.customer_review}
              </p>
            )}
            {job.cancellation_reason && (
              <p className="text-sm text-destructive">Lý do hủy: {job.cancellation_reason}</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lịch sử trạng thái (Audit Trail)</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 border-l pl-4">
                {(job.events as JobEvent[] | undefined)?.map((e, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-medium">{STATUS_VI[e.status] ?? e.status}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(e.timestamp)} · {e.actor_role}
                    </p>
                    {e.note && <p className="text-xs">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {isDisputed && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-base text-destructive">
                  ⚖️ Phân xử Tranh chấp & Hoàn tiền
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Hình thức xử lý</p>
                  <Select
                    options={DISPUTE_ACTION_OPTIONS}
                    value={disputeAction}
                    onChange={e =>
                      setDisputeAction(
                        e.target.value as 'refund_full' | 'refund_partial' | 'release_to_helper',
                      )
                    }
                  />
                </div>

                {disputeAction === 'refund_partial' && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Số tiền hoàn lại cho Khách (VNĐ) *
                    </p>
                    <Input
                      type="number"
                      placeholder="VD: 100000"
                      value={refundAmount}
                      onChange={e => setRefundAmount(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Kết luận & Lý do phân xử (gửi cho cả 2 bên) *
                  </p>
                  <Input
                    placeholder="VD: Thợ làm chưa sạch khu vực bếp, hoàn 100,000đ..."
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                  />
                </div>

                {resolveDispute.error && (
                  <p className="text-xs text-destructive">
                    {(resolveDispute.error as { response?: { data?: { message?: string } } })
                      .response?.data?.message ?? 'Xử lý tranh chấp thất bại'}
                  </p>
                )}

                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={
                    !adminNote.trim() ||
                    (disputeAction === 'refund_partial' && !Number(refundAmount)) ||
                    resolveDispute.isPending
                  }
                  onClick={() => {
                    if (
                      confirm(
                        'Xác nhận phán quyết tranh chấp này? Hệ thống sẽ tự động hoàn tiền/giải ngân và đóng tranh chấp.',
                      )
                    ) {
                      resolveDispute.mutate({
                        id,
                        action: disputeAction,
                        refund_amount:
                          disputeAction === 'refund_partial' ? Number(refundAmount) : undefined,
                        admin_note: adminNote.trim(),
                      });
                    }
                  }}
                >
                  {resolveDispute.isPending ? 'Đang xử lý…' : 'Xác nhận Phán quyết'}
                </Button>
              </CardContent>
            </Card>
          )}

          {canCancel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hủy job</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Lý do hủy (bắt buộc)"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
                {cancelJob.error && (
                  <p className="text-xs text-destructive">
                    {(cancelJob.error as { response?: { data?: { message?: string } } }).response
                      ?.data?.message ?? 'Hủy thất bại'}
                  </p>
                )}
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={!reason.trim() || cancelJob.isPending}
                  onClick={() => {
                    if (confirm('Hủy job này? Khách hàng và thợ sẽ nhận được thông báo.')) {
                      cancelJob.mutate({ id, reason: reason.trim() });
                    }
                  }}
                >
                  {cancelJob.isPending ? 'Đang hủy…' : 'Hủy job'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

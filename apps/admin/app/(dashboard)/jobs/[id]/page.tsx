'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAdminCancelJob, useAdminJob } from '@/hooks/use-admin';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
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
  const [reason, setReason] = useState('');

  if (isLoading) return <Loading />;
  if (error || !job) return <EmptyState message="Không tìm thấy job" />;

  const canCancel = CANCELLABLE.includes(job.status);

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
            <CardTitle className="text-base">Thông tin công việc</CardTitle>
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
                Ảnh khách gửi
              </p>
              <PhotoGrid urls={job.photos} />
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Ảnh hoàn thành
              </p>
              <PhotoGrid urls={job.completion_photos} />
              {job.completion_notes && (
                <p className="mt-2 text-sm text-muted-foreground">{job.completion_notes}</p>
              )}
            </div>
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
              <CardTitle className="text-base">Lịch sử trạng thái</CardTitle>
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

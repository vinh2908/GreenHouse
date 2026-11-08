'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useAdminCancelJob,
  useAdminJob,
  useAdminResolveDispute,
  useAdminUpdateJobStatus,
  useAdminDirectRefund,
} from '@/hooks/use-admin';
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
import { PromptDialog } from '@/components/common/prompt-dialog';

// Statuses from which the state machine still allows a cancellation.
const CANCELLABLE = [
  'open',
  'receiving_quotes',
  'quote_selected',
  'confirmed',
  'helper_on_the_way',
];

const ADMIN_JOB_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['open', 'cancelled'],
  open: ['receiving_quotes', 'confirmed', 'cancelled'],
  receiving_quotes: ['quote_selected', 'confirmed', 'cancelled'],
  quote_selected: ['confirmed', 'receiving_quotes', 'cancelled'],
  confirmed: ['helper_on_the_way', 'in_progress', 'cancelled'],
  helper_on_the_way: ['helper_arrived', 'in_progress', 'cancelled'],
  helper_arrived: ['in_progress', 'cancelled'],
  in_progress: ['pending_review', 'completed', 'disputed', 'cancelled'],
  pending_review: ['completed', 'disputed', 'in_progress', 'cancelled'],
  disputed: ['in_progress', 'completed', 'refunded', 'cancelled'],
  completed: [],
  cancelled: ['refunded'],
  refunded: [],
};

const ALL_STATUS_LABELS: Record<string, string> = {
  open: 'Đăng yêu cầu (open)',
  receiving_quotes: 'Đang nhận báo giá (receiving_quotes)',
  quote_selected: 'Đã chọn báo giá (quote_selected)',
  confirmed: 'Đã chốt thợ (confirmed)',
  helper_on_the_way: 'Thợ đang di chuyển (helper_on_the_way)',
  helper_arrived: 'Thợ đã đến nơi (helper_arrived)',
  in_progress: 'Đang làm việc (in_progress)',
  pending_review: 'Chờ nghiệm thu (pending_review)',
  completed: 'Hoàn tất (completed)',
  disputed: 'Tranh chấp (disputed)',
  cancelled: 'Đã hủy (cancelled)',
  refunded: 'Đã hoàn tiền (refunded)',
};

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

  const updateStatus = useAdminUpdateJobStatus();
  const directRefund = useAdminDirectRefund();
  const [manualStatus, setManualStatus] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [directRefundAmount, setDirectRefundAmount] = useState('');
  const [directRefundReason, setDirectRefundReason] = useState('');
  // B106: xác nhận bằng PromptDialog thay cho hộp thoại confirm của trình duyệt.
  const [confirmDispute, setConfirmDispute] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  if (isLoading) return <Loading />;
  if (error || !job) return <EmptyState message="Không tìm thấy job" />;

  const canCancel = CANCELLABLE.includes(job.status);
  const isDisputed = job.status === 'disputed';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
            ← Quay lại danh sách đơn
          </Link>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-tight">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {(job.service_id as any)?.name || (job as any).custom_service_name || 'Dịch vụ tự do'} ·
            Tạo lúc {formatDateTime(job.created_at)}
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

            {/* Chi tiết lịch hẹn & điều phối (Lệnh 6) */}
            <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Ngày & Giờ hẹn
                </p>
                <p className="mt-1 font-medium">
                  {job.preferred_date
                    ? `${typeof job.preferred_date === 'string' ? job.preferred_date.slice(0, 10) : new Date(job.preferred_date).toISOString().slice(0, 10)}`
                    : 'Chưa đặt ngày'}
                  {job.preferred_time_start
                    ? ` · ${job.preferred_time_start}${job.preferred_time_end ? ` – ${job.preferred_time_end}` : ''}`
                    : ''}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Hạn nhận đơn (Expires At)
                </p>
                <p className="mt-1 font-medium">
                  {job.expires_at ? formatDateTime(job.expires_at) : '72 giờ sau khi tạo'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Chế độ gửi riêng (Private Offer)
                </p>
                {job.private_offer_helper_id ? (
                  <div className="mt-1">
                    <p className="font-medium text-pink-700">
                      Gửi riêng cho: {job.private_offer_helper_id.full_name || 'Thợ'} (
                      <span className="font-mono">{job.private_offer_helper_id.phone}</span>)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Hạn độc quyền:{' '}
                      {job.private_offer_expires_at
                        ? formatDateTime(job.private_offer_expires_at)
                        : '—'}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">Đơn công khai (không gửi riêng)</p>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Danh sách thợ đã từ chối / bỏ qua
                </p>
                {job.rejected_helper_ids && job.rejected_helper_ids.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-xs space-y-0.5 text-destructive font-medium">
                    {job.rejected_helper_ids.map((h: any, idx: number) => (
                      <li key={h._id || idx}>
                        {h.full_name || 'Thợ'}{' '}
                        <span className="font-mono text-muted-foreground">({h.phone || '—'})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">Chưa có thợ nào bỏ qua đơn này</p>
                )}
              </div>
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
                  Hồ sơ Khiếu nại / Tranh chấp
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

            {/* Danh sách Báo giá (A02) */}
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Danh sách báo giá (Quotes) · {job.quotes?.length ?? 0} báo giá
              </p>
              {job.quotes && job.quotes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Thợ</th>
                        <th className="pb-2 font-medium">Giá đề xuất</th>
                        <th className="pb-2 font-medium">Ước tính</th>
                        <th className="pb-2 font-medium">Ghi chú</th>
                        <th className="pb-2 font-medium">Trạng thái</th>
                        <th className="pb-2 font-medium">Gửi lúc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-xs">
                      {job.quotes.map((q: any) => (
                        <tr key={q._id}>
                          <td className="py-2">
                            <p className="font-medium">{q.helper_id?.full_name || 'Thợ'}</p>
                            <p className="font-mono text-muted-foreground">{q.helper_id?.phone}</p>
                          </td>
                          <td className="py-2 font-semibold">
                            {(q.price ?? 0).toLocaleString('vi-VN')} ₫
                          </td>
                          <td className="py-2">
                            {q.estimated_duration ? `${q.estimated_duration} giờ` : '—'}
                          </td>
                          <td className="py-2 text-muted-foreground">{q.message || '—'}</td>
                          <td className="py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                q.status === 'accepted'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : q.status === 'rejected'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {q.status === 'accepted'
                                ? 'Đã chọn'
                                : q.status === 'rejected'
                                  ? 'Từ chối'
                                  : 'Chờ duyệt'}
                            </span>
                          </td>
                          <td className="py-2 text-muted-foreground font-mono">
                            {formatDateTime(q.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Chưa có báo giá nào cho đơn này.
                </p>
              )}
            </div>

            {/* Thông tin Thanh toán & Hợp đồng (A02) */}
            <div className="rounded-lg border p-4 space-y-3 bg-muted/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Thông tin Thanh toán & Hợp đồng
              </p>
              <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">Thanh toán:</span>
                  <p className="font-semibold uppercase mt-0.5">{job.payment_status || 'UNPAID'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Hình thức:</span>
                  <p className="font-semibold mt-0.5">
                    {job.payment_method === 'cash'
                      ? 'Tiền mặt'
                      : job.payment_method === 'wallet'
                        ? 'Ví Homemate'
                        : job.payment_method || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Khách đã trả (Net paid):</span>
                  <p className="font-semibold text-emerald-600 mt-0.5">
                    {((job as any).net_paid ?? 0).toLocaleString('vi-VN')} ₫
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tối đa hoàn lại:</span>
                  <p className="font-semibold text-amber-600 mt-0.5">
                    {((job as any).max_refundable ?? 0).toLocaleString('vi-VN')} ₫
                  </p>
                </div>
              </div>
              {job.contract && (
                <div className="border-t pt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Giá hợp đồng:</span>
                    <p className="font-medium">
                      {(job.contract.final_price ?? 0).toLocaleString('vi-VN')} ₫
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Thợ thực nhận:</span>
                    <p className="font-medium text-emerald-700">
                      {(job.contract.helper_receives ?? 0).toLocaleString('vi-VN')} ₫
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phí nền tảng:</span>
                    <p className="font-medium text-purple-700">
                      {(job.contract.platform_fee ?? 0).toLocaleString('vi-VN')} ₫
                    </p>
                  </div>
                </div>
              )}
            </div>
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
                  Phân xử Tranh chấp & Hoàn tiền
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
                  onClick={() => setConfirmDispute(true)}
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
                  onClick={() => setConfirmCancel(true)}
                >
                  {cancelJob.isPending ? 'Đang hủy…' : 'Hủy job'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Can thiệp Admin (đơn không tranh chấp / can thiệp trực tiếp) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Can thiệp Admin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {statusFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs ${
                    statusFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {statusFeedback.message}
                </div>
              )}
              {/* Đổi trạng thái thủ công */}
              <div className="space-y-2 border-b pb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Đổi trạng thái thủ công
                </p>
                {(() => {
                  const allowedTransitions = ADMIN_JOB_STATUS_TRANSITIONS[job.status] || [];
                  if (allowedTransitions.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground italic py-1">
                        Trạng thái &quot;{STATUS_VI[job.status] || job.status}&quot; là trạng thái
                        cuối, không thể chuyển đổi tiếp.
                      </p>
                    );
                  }
                  const options = [
                    {
                      value: job.status,
                      label: `${ALL_STATUS_LABELS[job.status] || job.status} (Hiện tại)`,
                    },
                    ...allowedTransitions.map(s => ({
                      value: s,
                      label: ALL_STATUS_LABELS[s] || s,
                    })),
                  ];
                  return (
                    <Select
                      value={manualStatus || job.status}
                      onChange={e => setManualStatus(e.target.value)}
                      options={options}
                    />
                  );
                })()}
                <Input
                  placeholder="Ghi chú lý do đổi trạng thái (tùy chọn)"
                  value={manualNote}
                  onChange={e => setManualNote(e.target.value)}
                />
                {updateStatus.error && (
                  <p className="text-xs text-destructive">
                    {(updateStatus.error as { response?: { data?: { message?: string } } }).response
                      ?.data?.message ?? 'Cập nhật trạng thái thất bại'}
                  </p>
                )}
                <Button
                  variant="outline"
                  className="w-full text-xs"
                  disabled={
                    !manualStatus ||
                    manualStatus === job.status ||
                    !(ADMIN_JOB_STATUS_TRANSITIONS[job.status] || []).includes(manualStatus) ||
                    updateStatus.isPending
                  }
                  onClick={() => setConfirmStatus(true)}
                >
                  {updateStatus.isPending ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}
                </Button>
              </div>

              {/* Hoàn tiền trực tiếp cho khách hàng */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Hoàn tiền ngoài tranh chấp
                </p>
                <Input
                  type="number"
                  placeholder="Số tiền hoàn (₫)"
                  value={directRefundAmount}
                  onChange={e => setDirectRefundAmount(e.target.value)}
                />
                <Input
                  placeholder="Lý do hoàn tiền (bắt buộc)"
                  value={directRefundReason}
                  onChange={e => setDirectRefundReason(e.target.value)}
                />
                {directRefund.error && (
                  <p className="text-xs text-destructive">
                    {(directRefund.error as { response?: { data?: { message?: string } } }).response
                      ?.data?.message ?? 'Hoàn tiền thất bại'}
                  </p>
                )}
                <Button
                  variant="secondary"
                  className="w-full text-xs"
                  disabled={
                    !Number(directRefundAmount) ||
                    !directRefundReason.trim() ||
                    directRefund.isPending
                  }
                  onClick={() => setConfirmRefund(true)}
                >
                  {directRefund.isPending ? 'Đang hoàn tiền…' : 'Hoàn tiền vào ví khách'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {confirmDispute && (
        <PromptDialog
          title="Xác nhận phán quyết tranh chấp"
          message="Xác nhận phán quyết tranh chấp này? Hệ thống sẽ tự động hoàn tiền/giải ngân và đóng tranh chấp."
          confirmLabel="Xác nhận Phán quyết"
          requireInput={false}
          onSubmit={() => {
            setConfirmDispute(false);
            resolveDispute.mutate({
              id,
              action: disputeAction,
              refund_amount: disputeAction === 'refund_partial' ? Number(refundAmount) : undefined,
              admin_note: adminNote.trim(),
            });
          }}
          onClose={() => setConfirmDispute(false)}
        />
      )}
      {confirmCancel && (
        <PromptDialog
          title="Hủy job"
          message="Hủy job này? Khách hàng và thợ sẽ nhận được thông báo."
          confirmLabel="Hủy job"
          requireInput={false}
          onSubmit={() => {
            setConfirmCancel(false);
            cancelJob.mutate({ id, reason: reason.trim() });
          }}
          onClose={() => setConfirmCancel(false)}
        />
      )}
      {confirmStatus && (
        <PromptDialog
          title="Đổi trạng thái đơn"
          message={`Chuyển trạng thái đơn sang "${manualStatus}"?`}
          confirmLabel="Cập nhật trạng thái"
          requireInput={false}
          onSubmit={() => {
            setConfirmStatus(false);
            updateStatus.mutate(
              { id, status: manualStatus, note: manualNote.trim() },
              {
                onSuccess: () => {
                  setManualStatus('');
                  setManualNote('');
                  setStatusFeedback({
                    type: 'success',
                    message: 'Đã cập nhật trạng thái đơn thành công',
                  });
                },
                onError: (err: any) => {
                  setStatusFeedback({
                    type: 'error',
                    message:
                      err?.response?.data?.message ||
                      'Không thể cập nhật trạng thái đơn. Vui lòng kiểm tra lại.',
                  });
                },
              },
            );
          }}
          onClose={() => setConfirmStatus(false)}
        />
      )}
      {confirmRefund && (
        <PromptDialog
          title="Hoàn tiền vào ví khách"
          message={`Hoàn ${Number(directRefundAmount).toLocaleString('vi-VN')}₫ vào ví của khách hàng?`}
          confirmLabel="Hoàn tiền"
          requireInput={false}
          onSubmit={() => {
            setConfirmRefund(false);
            directRefund.mutate(
              {
                id,
                amount: Number(directRefundAmount),
                reason: directRefundReason.trim(),
              },
              {
                onSuccess: () => {
                  setDirectRefundAmount('');
                  setDirectRefundReason('');
                  setStatusFeedback({
                    type: 'success',
                    message: 'Đã hoàn tiền vào ví khách hàng thành công',
                  });
                },
                onError: (err: any) => {
                  setStatusFeedback({
                    type: 'error',
                    message:
                      err?.response?.data?.message ||
                      'Không thể hoàn tiền trực tiếp. Vui lòng thử lại.',
                  });
                },
              },
            );
          }}
          onClose={() => setConfirmRefund(false)}
        />
      )}
    </div>
  );
}

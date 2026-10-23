'use client';

import { useState } from 'react';
import {
  AdminClaim,
  AdminClaimStatus,
  useAdminClaim,
  useAdminClaims,
  useReviewClaim,
} from '@/hooks/use-admin';
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
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatDateTime, formatVND } from '@/lib/utils';

const STATUS_META: Record<AdminClaimStatus, { label: string; variant: string }> = {
  submitted: { label: 'Mới gửi', variant: 'warning' },
  under_review: { label: 'Đang xem xét', variant: 'info' },
  approved: { label: 'Đã duyệt', variant: 'success' },
  paid: { label: 'Đã chi trả', variant: 'success' },
  rejected: { label: 'Đã từ chối', variant: 'danger' },
};

const TIMELINE_LABEL: Record<AdminClaimStatus, string> = {
  submitted: '📨 Khách gửi yêu cầu',
  under_review: '🔎 Bắt đầu xem xét',
  approved: '✅ Duyệt bồi thường',
  paid: '💰 Đã chi trả vào ví khách',
  rejected: '❌ Từ chối bồi thường',
};

const errorMessage = (err: unknown) => {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data;
  return msg?.message || 'Có lỗi xảy ra';
};

const personName = (p: AdminClaim['customer_id']) =>
  p && typeof p === 'object' ? (p.full_name ?? '—') : '—';
const personPhone = (p: AdminClaim['customer_id']) =>
  p && typeof p === 'object' ? (p.phone ?? '') : '';
const jobTitle = (j: AdminClaim['job_id']) =>
  j && typeof j === 'object' ? (j.title ?? 'Đơn đã hoàn thành') : 'Đơn đã hoàn thành';
const jobIdOf = (j: AdminClaim['job_id']) =>
  j && typeof j === 'object' ? j._id : typeof j === 'string' ? j : '';

export default function ClaimsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useAdminClaims({ status: status || undefined, page });

  const claims = data?.claims ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Bồi thường bảo hiểm 🛡</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Yêu cầu bồi thường của khách cho các đơn đã hoàn thành (cửa sổ bảo hiểm mặc định 30
                ngày). Duyệt bồi thường = cộng tiền thẳng vào ví của khách.
              </p>
            </div>
            <div className="w-56">
              <Select
                value={status}
                onChange={e => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'Tất cả trạng thái' },
                  { value: 'submitted', label: 'Mới gửi' },
                  { value: 'under_review', label: 'Đang xem xét' },
                  { value: 'approved', label: 'Đã duyệt' },
                  { value: 'paid', label: 'Đã chi trả' },
                  { value: 'rejected', label: 'Đã từ chối' },
                ]}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loading />
          ) : claims.length === 0 ? (
            <EmptyState message="Chưa có yêu cầu bồi thường nào." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Khách</TableHead>
                  <TableHead>Đơn gốc</TableHead>
                  <TableHead>Số tiền yêu cầu</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày gửi</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map(c => (
                  <TableRow key={c._id}>
                    <TableCell className="font-bold">#{c._id.slice(-6).toUpperCase()}</TableCell>
                    <TableCell>
                      {personName(c.customer_id)}
                      {personPhone(c.customer_id) && (
                        <p className="text-xs text-muted-foreground">
                          {personPhone(c.customer_id)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {jobTitle(c.job_id)}
                      <p className="text-xs text-muted-foreground">
                        #{jobIdOf(c.job_id).slice(-6)}
                      </p>
                    </TableCell>
                    <TableCell>
                      {c.requested_amount ? formatVND(c.requested_amount) : '—'}
                      {c.status === 'paid' && (
                        <p className="text-xs text-green-700">
                          Đã trả {formatVND(c.approved_amount)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_META[c.status].variant}>
                        {STATUS_META[c.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(c.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedId(c._id)}>
                        Xem & xử lý
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {(data?.total_pages ?? 1) > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Trước
              </Button>
              <span className="text-sm">
                Trang {page} / {data?.total_pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= (data?.total_pages ?? 1)}
                onClick={() => setPage(p => p + 1)}
              >
                Sau
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && <ClaimDetail claimId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function ClaimDetail({ claimId, onClose }: { claimId: string; onClose: () => void }) {
  const { data: claim, isLoading } = useAdminClaim(claimId);
  const review = useReviewClaim();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const job = claim?.job_id && typeof claim.job_id === 'object' ? claim.job_id : null;
  const isFinal = claim?.status === 'paid' || claim?.status === 'rejected';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            Chi tiết yêu cầu {claim ? `#${claim._id.slice(-6).toUpperCase()}` : ''}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Đóng ✕
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading || !claim ? (
          <Loading />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="font-semibold">Khách hàng</p>
                <p>
                  {personName(claim.customer_id)}{' '}
                  {personPhone(claim.customer_id) && `· ${personPhone(claim.customer_id)}`}
                </p>
              </div>
              <div>
                <p className="font-semibold">Đơn gốc</p>
                <p>
                  {job?.title ?? '—'} (#{jobIdOf(claim.job_id).slice(-6)})
                </p>
                {job?.description && <p className="text-muted-foreground">{job.description}</p>}
              </div>
              <div>
                <p className="font-semibold">Trạng thái</p>
                <Badge variant={STATUS_META[claim.status].variant}>
                  {STATUS_META[claim.status].label}
                </Badge>
                <p className="text-muted-foreground mt-1">Gửi {formatDateTime(claim.created_at)}</p>
              </div>
            </div>

            <div>
              <p className="font-semibold text-sm mb-1">Mô tả thiệt hại</p>
              <p className="text-sm whitespace-pre-wrap">{claim.description}</p>
              {claim.requested_amount ? (
                <p className="text-sm mt-2">
                  Số tiền khách đề nghị: <b>{formatVND(claim.requested_amount)}</b>
                </p>
              ) : null}
              {claim.status === 'paid' && (
                <p className="text-sm mt-1 text-green-700">
                  Đã chi trả {formatVND(claim.approved_amount)} vào ví khách
                  {claim.payout_transaction_id
                    ? ` · GD #${claim.payout_transaction_id.slice(-6)}`
                    : ''}
                </p>
              )}
              {claim.status === 'rejected' && claim.reject_reason && (
                <p className="text-sm mt-1 text-red-700">Lý do từ chối: {claim.reject_reason}</p>
              )}
            </div>

            {claim.photos.length > 0 && (
              <div>
                <p className="font-semibold text-sm mb-2">Ảnh bằng chứng</p>
                <div className="flex flex-wrap gap-3">
                  {claim.photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Bằng chứng ${i + 1}`}
                        className="w-28 h-28 object-cover rounded-lg border"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="font-semibold text-sm mb-2">Diễn biến xử lý</p>
              <div className="space-y-2">
                {(claim.timeline ?? []).map((t, i) => (
                  <div key={i} className="text-sm flex gap-3">
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatDateTime(t.at)}
                    </span>
                    <span>
                      <b>{TIMELINE_LABEL[t.status] ?? t.status}</b>
                      {t.note ? ` — ${t.note}` : ''}{' '}
                      <span className="text-muted-foreground">
                        ({t.actor_role === 'admin' ? 'Admin' : 'Khách hàng'})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {!isFinal && (
              <div className="border-t pt-4 space-y-4">
                {claim.status === 'submitted' && (
                  <Button
                    disabled={review.isPending}
                    onClick={() =>
                      act(() => review.mutateAsync({ id: claim._id, action: 'start_review' }))
                    }
                  >
                    🔎 Bắt đầu xem xét
                  </Button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Duyệt bồi thường (VNĐ)</label>
                    <Input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder={
                        claim.requested_amount ? String(claim.requested_amount) : 'VD: 500000'
                      }
                    />
                    <Button
                      disabled={review.isPending || !amount}
                      onClick={() =>
                        act(() =>
                          review.mutateAsync({
                            id: claim._id,
                            action: 'approve',
                            approved_amount: Number(amount) || 0,
                          }),
                        )
                      }
                    >
                      ✅ Duyệt & chi trả vào ví khách
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Từ chối (bắt buộc nhập lý do)</label>
                    <Input
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="VD: Thiệt hại không thuộc phạm vi bảo hiểm…"
                    />
                    <Button
                      variant="destructive"
                      disabled={review.isPending || !reason.trim()}
                      onClick={() =>
                        act(() =>
                          review.mutateAsync({
                            id: claim._id,
                            action: 'reject',
                            note: reason.trim(),
                          }),
                        )
                      }
                    >
                      ❌ Từ chối yêu cầu
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

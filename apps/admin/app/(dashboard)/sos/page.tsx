'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  useFlaggedSosRequests,
  useHelperPenaltyEvents,
  useWaivePenaltyEvent,
  useResolveFlaggedSos,
  type AdminPenaltyEvent,
  type AdminSosUserRef,
} from '@/hooks/use-admin';
import { PromptDialog } from '@/components/common/prompt-dialog';
import {
  Badge,
  Button,
  Input,
  Loading,
  EmptyState,
  Pagination,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui';
import { formatDateTime, formatVND } from '@/lib/utils';
import { Siren, ScrollText, X } from 'lucide-react';

// ─── Nhãn tiếng Việt (theo enum phía API) ─────────────────────────────────────

const REASON_VI: Record<string, string> = {
  personal_emergency: 'Việc cá nhân khẩn cấp',
  accident: 'Tai nạn',
  vehicle_breakdown: 'Xe hư / sự cố phương tiện',
  family_emergency: 'Việc gia đình khẩn cấp',
  other: 'Lý do khác',
};

const SOS_STATUS_VI: Record<string, string> = {
  awaiting_customer: 'Chờ khách quyết định',
  pending: 'Đang tìm thợ thay',
  accepted: 'Đã có thợ thay',
  customer_cancelled: 'Khách đã hủy đơn',
  decision_timeout: 'Khách không phản hồi',
  cancelled: 'Thợ đã thu hồi SOS',
  expired: 'Hết hạn — không ai nhận',
};

const SOS_STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'secondary'> = {
  awaiting_customer: 'warning',
  pending: 'info',
  accepted: 'success',
  customer_cancelled: 'danger',
  decision_timeout: 'danger',
  cancelled: 'secondary',
  expired: 'danger',
};

const SOURCE_VI: Record<string, string> = {
  job_cancel: 'Hủy đơn',
  sos_initiation: 'Khởi tạo SOS',
};

// ─── Helpers hiển thị ─────────────────────────────────────────────────────────

type PersonRef = AdminSosUserRef | string | null | undefined;

function PersonCell({ person }: { person: PersonRef }) {
  if (!person || typeof person !== 'object') {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div>
      <Link href={`/users/${person._id}`} className="font-medium hover:underline">
        {person.full_name}
      </Link>
      <p className="font-mono text-xs text-muted-foreground">{person.phone}</p>
    </div>
  );
}

function jobIdOf(job: AdminPenaltyEvent['job_id'] | { _id: string } | string | null | undefined) {
  return job && typeof job === 'object' ? job._id : typeof job === 'string' ? job : '';
}

// ─── Tab 1: SOS bị gắn cờ ─────────────────────────────────────────────────────

function FlaggedSosTab({
  data,
  isLoading,
  isError,
  refetch,
  page,
  setPage,
}: {
  data: ReturnType<typeof useFlaggedSosRequests>['data'];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  page: number;
  setPage: (p: number) => void;
}) {
  const requests = data?.requests ?? [];
  const resolveSos = useResolveFlaggedSos();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border bg-card">
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <div className="p-8 text-center space-y-3">
          <p className="text-destructive font-medium">Không thể tải danh sách SOS cần chú ý</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tải lại
          </Button>
        </div>
      ) : requests.length === 0 ? (
        <EmptyState message="Không có yêu cầu SOS nào đang cần chú ý" />
      ) : (
        <>
          <div className="overflow-x-auto w-full">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Đơn</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Thợ gốc</TableHead>
                  <TableHead>Lý do SOS</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(r => {
                  const jobId = jobIdOf(r.job_id);
                  const jobTitle =
                    r.job_id && typeof r.job_id === 'object' && r.job_id.title
                      ? r.job_id.title
                      : r.job_title;
                  return (
                    <TableRow key={r._id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(r.created_at)}
                      </TableCell>
                      <TableCell>
                        {jobId ? (
                          <Link href={`/jobs/${jobId}`} className="font-medium hover:underline">
                            {jobTitle}
                          </Link>
                        ) : (
                          <span className="font-medium">{jobTitle}</span>
                        )}
                        <p className="text-xs text-muted-foreground">
                          #{jobId.slice(-6)}
                          {r.service_name ? ` • ${r.service_name}` : ''}
                          {r.refund_amount > 0 ? ` • Đã hoàn ${formatVND(r.refund_amount)}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <PersonCell person={r.customer_id} />
                      </TableCell>
                      <TableCell>
                        <PersonCell person={r.original_helper_id} />
                        {r.replacement_helper_id && typeof r.replacement_helper_id === 'object' && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Thay: {r.replacement_helper_id.full_name}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{REASON_VI[r.reason] ?? r.reason}</TableCell>
                      <TableCell>
                        <Badge variant={SOS_STATUS_BADGE[r.status] ?? 'secondary'}>
                          {SOS_STATUS_VI[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resolveSos.isPending}
                          onClick={() => setResolvingId(r._id)}
                        >
                          Xử lý & Ghi chú
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} totalPages={data?.total_pages ?? 1} onPageChange={setPage} />
        </>
      )}

      {resolvingId && (
        <PromptDialog
          title="Xác nhận xử lý SOS"
          message="Gỡ cờ cần chú ý và lưu ghi chú xử lý của admin vào yêu cầu SOS này."
          label="Ghi chú admin (tùy chọn)"
          placeholder="VD: Đã liên hệ thợ thay thế / Đã hoàn tiền cho khách..."
          requireInput={false}
          confirmLabel={resolveSos.isPending ? 'Đang xử lý...' : 'Đánh dấu đã xử lý'}
          onSubmit={note => {
            resolveSos.mutate({ id: resolvingId, note });
            setResolvingId(null);
          }}
          onClose={() => setResolvingId(null)}
        />
      )}
    </div>
  );
}

// ─── Dialog miễn phạt ─────────────────────────────────────────────────────────

function WaiveDialog({ event, onClose }: { event: AdminPenaltyEvent; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const waive = useWaivePenaltyEvent();

  const helperName =
    event.helper_id && typeof event.helper_id === 'object' ? event.helper_id.full_name : 'thợ';

  const handleConfirm = () => {
    if (!reason.trim()) return;
    waive.mutate(
      { id: event._id, reason: reason.trim() },
      {
        onSuccess: result => {
          if (result.already_waived) {
            // Sự kiện đã được miễn trước đó — server không gỡ thêm mốc nào.
            setNotice(
              `Sự kiện này đã được miễn trước đó${
                result.helper_score
                  ? ` — điểm hiệu suất hiện tại: ${result.helper_score.total}`
                  : ''
              }. Danh sách đã được làm mới.`,
            );
          } else {
            onClose();
          }
        },
      },
    );
  };

  const errorMessage =
    (waive.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message ?? (waive.error ? 'Miễn phạt thất bại, vui lòng thử lại.' : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card shadow-lg">
        <div className="flex items-start justify-between p-5 pb-0">
          <div>
            <h2 className="text-lg font-bold">Miễn phạt hủy đơn</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Thợ <span className="font-medium text-foreground">{helperName}</span> — sự kiện trừ{' '}
              {event.points_deducted} điểm lúc {formatDateTime(event.created_at)}. Sau khi miễn,
              điểm của thợ được tính lại không còn sự kiện này.
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            className="rounded p-1 hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {notice ? (
            <>
              <p className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
                {notice}
              </p>
              <div className="flex justify-end">
                <Button onClick={onClose}>Đóng</Button>
              </div>
            </>
          ) : (
            <>
              <textarea
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={3}
                placeholder="Lý do miễn phạt (bắt buộc)..."
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
              {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Hủy
                </Button>
                <Button loading={waive.isPending} disabled={!reason.trim()} onClick={handleConfirm}>
                  Xác nhận miễn phạt
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2: Sổ điểm phạt ──────────────────────────────────────────────────────

function PenaltyEventsTab({
  data,
  isLoading,
  isError,
  refetch,
  page,
  setPage,
  status,
  setStatus,
  helperId,
  setHelperId,
}: {
  data: ReturnType<typeof useHelperPenaltyEvents>['data'];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  page: number;
  setPage: (p: number) => void;
  status: string;
  setStatus: (s: string) => void;
  helperId: string;
  setHelperId: (id: string) => void;
}) {
  const [helperIdInput, setHelperIdInput] = useState('');
  const [waiving, setWaiving] = useState<AdminPenaltyEvent | null>(null);
  const events = data?.events ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-72">
          <Input
            label="Lọc theo ID thợ (user_id)"
            placeholder="Dán user_id của thợ..."
            value={helperIdInput}
            onChange={e => setHelperIdInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setHelperId(helperIdInput.trim());
                setPage(1);
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setHelperId(helperIdInput.trim());
            setPage(1);
          }}
        >
          Lọc
        </Button>
        <div className="w-52">
          <Select
            label="Trạng thái"
            value={status}
            onChange={e => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'active', label: 'Đang tính phạt' },
              { value: 'waived', label: 'Đã miễn' },
            ]}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden max-w-full">
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-destructive font-medium">Không thể tải sổ điểm phạt</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tải lại
            </Button>
          </div>
        ) : events.length === 0 ? (
          <EmptyState message="Chưa có sự kiện phạt nào" />
        ) : (
          <>
            <div className="overflow-x-auto w-full">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Thợ</TableHead>
                    <TableHead>Điểm trừ</TableHead>
                    <TableHead>Nguồn / Đơn</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map(ev => {
                    const jobId = jobIdOf(ev.job_id);
                    const jobTitle =
                      ev.job_id && typeof ev.job_id === 'object' ? ev.job_id.title : undefined;
                    return (
                      <TableRow key={ev._id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDateTime(ev.created_at)}
                        </TableCell>
                        <TableCell>
                          <PersonCell person={ev.helper_id} />
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-red-600">−{ev.points_deducted}đ</span>
                          <p className="text-xs text-muted-foreground">
                            {ev.cancellations_in_window} lần hủy / 7 ngày • Điểm sau phạt:{' '}
                            {ev.performance_score_after}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {SOURCE_VI[ev.source] ?? ev.source}
                          {jobId && (
                            <p className="text-xs text-muted-foreground">
                              <Link href={`/jobs/${jobId}`} className="hover:underline">
                                {jobTitle ?? `Đơn #${jobId.slice(-6)}`}
                              </Link>
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {ev.status === 'waived' ? (
                            <>
                              <Badge variant="secondary">Đã miễn</Badge>
                              {ev.waive_reason && (
                                <p className="text-xs text-muted-foreground mt-1 max-w-56">
                                  {ev.waive_reason}
                                  {ev.waived_at ? ` — ${formatDateTime(ev.waived_at)}` : ''}
                                </p>
                              )}
                            </>
                          ) : (
                            <Badge variant="danger">Đang tính phạt</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {ev.status !== 'waived' && (
                            <Button size="sm" variant="outline" onClick={() => setWaiving(ev)}>
                              Miễn phạt
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalPages={data?.total_pages ?? 1} onPageChange={setPage} />
          </>
        )}
      </div>

      {waiving && <WaiveDialog event={waiving} onClose={() => setWaiving(null)} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SosOversightPage() {
  const [tab, setTab] = useState<'flagged' | 'penalties'>('flagged');
  // B12: mỗi query chỉ gọi 1 lần ở cấp trang, truyền xuống tab qua props
  // (trước đây trang + tab gọi trùng nhau).
  const [flaggedPage, setFlaggedPage] = useState(1);
  const [penaltyPage, setPenaltyPage] = useState(1);
  const [penaltyStatus, setPenaltyStatus] = useState('');
  const [penaltyHelperId, setPenaltyHelperId] = useState('');
  const flagged = useFlaggedSosRequests({ page: flaggedPage });
  const penalties = useHelperPenaltyEvents({
    helper_id: penaltyHelperId || undefined,
    status: penaltyStatus || undefined,
    page: penaltyPage,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SOS & Điểm phạt</h1>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{flagged.data?.total ?? 0}</span> yêu cầu
          SOS đang cần chú ý •{' '}
          <span className="font-semibold text-foreground">{penalties.data?.total ?? 0}</span> sự
          kiện phạt trong sổ
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={tab === 'flagged' ? 'default' : 'outline'}
          onClick={() => setTab('flagged')}
        >
          <Siren className="mr-2 h-4 w-4" />
          SOS cần chú ý
        </Button>
        <Button
          variant={tab === 'penalties' ? 'default' : 'outline'}
          onClick={() => setTab('penalties')}
        >
          <ScrollText className="mr-2 h-4 w-4" />
          Sổ điểm phạt
        </Button>
      </div>

      {tab === 'flagged' ? (
        <FlaggedSosTab
          data={flagged.data}
          isLoading={flagged.isLoading}
          isError={flagged.isError}
          refetch={flagged.refetch}
          page={flaggedPage}
          setPage={setFlaggedPage}
        />
      ) : (
        <PenaltyEventsTab
          data={penalties.data}
          isLoading={penalties.isLoading}
          isError={penalties.isError}
          refetch={penalties.refetch}
          page={penaltyPage}
          setPage={setPenaltyPage}
          status={penaltyStatus}
          setStatus={s => {
            setPenaltyStatus(s);
            setPenaltyPage(1);
          }}
          helperId={penaltyHelperId}
          setHelperId={id => {
            setPenaltyHelperId(id);
            setPenaltyPage(1);
          }}
        />
      )}
    </div>
  );
}

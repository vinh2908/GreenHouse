'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useActivateUser,
  useAdminUser,
  useApproveKyc,
  useRejectKyc,
  useSuspendUser,
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
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { PhotoGrid } from '@/components/common/photo-grid';
import { formatDate, formatDateTime, formatVND } from '@/lib/utils';
import { STATUS_BADGE, STATUS_VI } from '../../jobs/status';

type Ref = {
  _id: string;
  full_name?: string;
  phone?: string;
  name?: string;
  title?: string;
} | null;

interface JobRow {
  _id: string;
  title: string;
  status: string;
  created_at: string;
  is_sos?: boolean;
  address?: { district?: string; city?: string };
  service_id?: Ref;
  customer_id?: Ref;
  helper_id?: Ref;
}

interface Txn {
  _id: string;
  type: string;
  status: string;
  amount: number;
  description: string;
  created_at: string;
}

interface ReviewRow {
  _id: string;
  rating: number;
  comment?: string;
  created_at: string;
  job_id?: Ref;
  customer_id?: Ref;
  helper_id?: Ref;
}

const KYC_VI: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }
> = {
  approved: { label: 'Đã duyệt', variant: 'success' },
  pending: { label: 'Chờ duyệt', variant: 'warning' },
  rejected: { label: 'Từ chối', variant: 'danger' },
  not_submitted: { label: 'Chưa nộp', variant: 'secondary' },
};

const ROLE_VI: Record<string, string> = {
  customer: 'Khách hàng',
  helper: 'Thợ',
  admin: 'Quản trị',
};
const TXN_VI: Record<string, string> = {
  payment: 'Thanh toán',
  earning: 'Thu nhập',
  withdrawal: 'Rút tiền',
  refund: 'Hoàn tiền',
};

const sum = (counts?: Record<string, number>) =>
  Object.values(counts ?? {}).reduce((a, b) => a + b, 0);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children ?? '—'}</div>
    </div>
  );
}

function JobsTable({
  jobs,
  counterpart,
}: {
  jobs: JobRow[];
  counterpart: 'customer_id' | 'helper_id';
}) {
  if (!jobs.length) return <EmptyState message="Chưa có công việc" />;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Công việc</TableHead>
            <TableHead>{counterpart === 'helper_id' ? 'Thợ' : 'Khách hàng'}</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ngày tạo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map(j => (
            <TableRow key={j._id}>
              <TableCell>
                <Link href={`/jobs/${j._id}`} className="font-medium hover:underline">
                  {j.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {j.service_id?.name} · {j.address?.district}, {j.address?.city}
                </p>
              </TableCell>
              <TableCell className="text-sm">
                {j[counterpart] ? (
                  <Link href={`/users/${j[counterpart]!._id}`} className="hover:underline">
                    {j[counterpart]!.full_name}
                  </Link>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[j.status] ?? 'secondary'}>
                  {STATUS_VI[j.status] ?? j.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDateTime(j.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReviewList({ reviews, by }: { reviews: ReviewRow[]; by: 'customer_id' | 'helper_id' }) {
  if (!reviews.length) return <EmptyState message="Chưa có đánh giá" />;
  return (
    <ul className="divide-y">
      {reviews.map(r => (
        <li key={r._id} className="py-3 text-sm">
          <p>
            <b>{'★'.repeat(r.rating)}</b>
            <span className="text-muted-foreground">{'★'.repeat(5 - r.rating)}</span> ·{' '}
            {by === 'customer_id' ? 'từ' : 'cho'} {r[by]?.full_name ?? '—'} · {r.job_id?.title}
          </p>
          {r.comment && <p className="mt-1">{r.comment}</p>}
          <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
        </li>
      ))}
    </ul>
  );
}

const TABS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'customer', label: 'Đơn đã đặt' },
  { key: 'helper', label: 'Việc đã nhận' },
  { key: 'wallet', label: 'Ví & giao dịch' },
  { key: 'reviews', label: 'Đánh giá' },
] as const;

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAdminUser(id);
  const suspend = useSuspendUser();
  const activate = useActivateUser();
  const approveKyc = useApproveKyc();
  const rejectKyc = useRejectKyc();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('overview');

  if (isLoading) return <Loading />;
  if (error || !data?.user) return <EmptyState message="Không tìm thấy người dùng" />;

  const { user, helper_profile: hp, customer_profile: cp, wallet, job_counts, rating_stats } = data;
  const isHelper = !!hp || user.roles?.includes('helper');
  const kyc = KYC_VI[hp?.verification_status ?? 'not_submitted'] ?? KYC_VI.not_submitted;
  const suspended = user.status === 'suspended';
  const isAdmin = user.roles?.includes('admin');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" className="h-16 w-16 rounded-full border object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-semibold">
              {user.full_name?.[0] ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <Link href="/users" className="text-sm text-muted-foreground hover:underline">
              ← Người dùng
            </Link>
            <h1 className="break-words text-2xl font-bold tracking-tight">{user.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{user.phone}</span>
              {user.roles?.map((r: string) => (
                <Badge key={r} variant="secondary">
                  {ROLE_VI[r] ?? r}
                </Badge>
              ))}
              <Badge variant={suspended ? 'danger' : 'success'}>
                {suspended ? 'Đã khóa' : 'Hoạt động'}
              </Badge>
              {isHelper && <Badge variant={kyc.variant}>KYC: {kyc.label}</Badge>}
            </div>
          </div>
        </div>
        {!isAdmin && (
          <Button
            variant={suspended ? 'default' : 'destructive'}
            disabled={suspend.isPending || activate.isPending}
            onClick={() => {
              if (suspended) {
                activate.mutate(user._id);
              } else {
                const reason = prompt('Lý do khóa tài khoản?');
                if (reason?.trim()) suspend.mutate({ id: user._id, reason: reason.trim() });
              }
            }}
          >
            {suspended ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
          </Button>
        )}
      </div>

      {suspended && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Tài khoản bị khóa{user.suspended_at ? ` lúc ${formatDateTime(user.suspended_at)}` : ''}.
          {user.suspension_reason && <> Lý do: {user.suspension_reason}</>}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Đơn đã đặt" value={sum(job_counts?.as_customer)} />
        <StatCard title="Việc đã nhận" value={sum(job_counts?.as_helper)} />
        <StatCard title="Số dư ví" value={formatVND(wallet?.balance ?? 0)} />
        <StatCard
          title="Đánh giá (thợ)"
          value={rating_stats?.total ? `${rating_stats.average}★` : '—'}
          description={`${rating_stats?.total ?? 0} lượt · ${job_counts?.as_helper?.completed ?? 0} việc xong`}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.filter(t => t.key !== 'helper' || isHelper).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tài khoản</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">{user.email}</Field>
              <Field label="Xác minh SĐT">{user.is_verified ? 'Đã xác minh' : 'Chưa'}</Field>
              <Field label="Vai trò đang dùng">
                {ROLE_VI[user.active_role] ?? user.active_role}
              </Field>
              <Field label="Ngày tạo">{formatDate(user.created_at)}</Field>
              {cp && (
                <>
                  <Field label="Tổng chi tiêu">{formatVND(cp.total_spent ?? 0)}</Field>
                  <Field label="Địa chỉ đã lưu">{cp.addresses?.length ?? 0}</Field>
                </>
              )}
            </CardContent>
          </Card>

          {isHelper && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hồ sơ thợ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Trạng thái">{hp?.status}</Field>
                  <Field label="Kinh nghiệm">
                    {hp?.years_experience != null ? `${hp.years_experience} năm` : null}
                  </Field>
                  <Field label="Dịch vụ">
                    {hp?.service_ids?.map((s: { name: string }) => s.name).join(', ') || null}
                  </Field>
                  <Field label="Khu vực">{hp?.working_areas?.join(', ') || null}</Field>
                </div>
                {hp?.bio && <Field label="Giới thiệu">{hp.bio}</Field>}
                <Field label="Tài khoản ngân hàng">
                  {hp?.bank_account ? (
                    <>
                      {hp.bank_account.bank_name} ·{' '}
                      <span className="font-mono">{hp.bank_account.account_number}</span> ·{' '}
                      {hp.bank_account.account_name}
                    </>
                  ) : null}
                </Field>
              </CardContent>
            </Card>
          )}

          {isHelper && hp?.verification_status && hp.verification_status !== 'not_submitted' && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Hồ sơ e-KYC</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>
                    Số CCCD: <b className="font-mono">{hp.id_card_number ?? '—'}</b>
                  </span>
                  <Badge variant={kyc.variant}>{kyc.label}</Badge>
                  {hp.verified_at && (
                    <span className="text-muted-foreground">
                      Duyệt lúc {formatDateTime(hp.verified_at)}
                    </span>
                  )}
                  {hp.rejection_reason && (
                    <span className="text-destructive">Lý do từ chối: {hp.rejection_reason}</span>
                  )}
                </div>
                <PhotoGrid
                  urls={[hp.id_card_front, hp.id_card_back, hp.selfie_photo].filter(Boolean)}
                />
                {hp.verification_status === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      disabled={approveKyc.isPending}
                      onClick={() =>
                        confirm('Duyệt e-KYC cho thợ này?') && approveKyc.mutate(user._id)
                      }
                    >
                      Duyệt KYC
                    </Button>
                    <Button
                      variant="outline"
                      disabled={rejectKyc.isPending}
                      onClick={() => {
                        const reason = prompt('Lý do từ chối?');
                        if (reason?.trim())
                          rejectKyc.mutate({ userId: user._id, reason: reason.trim() });
                      }}
                    >
                      Từ chối
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'customer' && (
        <Card>
          <CardContent className="pt-6">
            <JobsTable jobs={data.jobs_as_customer} counterpart="helper_id" />
          </CardContent>
        </Card>
      )}

      {tab === 'helper' && (
        <Card>
          <CardContent className="pt-6">
            <JobsTable jobs={data.jobs_as_helper} counterpart="customer_id" />
          </CardContent>
        </Card>
      )}

      {tab === 'wallet' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title="Số dư" value={formatVND(wallet?.balance ?? 0)} />
            <StatCard title="Tổng thu nhập" value={formatVND(wallet?.total_earned ?? 0)} />
            <StatCard title="Đã rút" value={formatVND(wallet?.total_withdrawn ?? 0)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Giao dịch gần đây</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!data.transactions.length ? (
                <EmptyState message="Chưa có giao dịch" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại</TableHead>
                      <TableHead>Mô tả</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thời gian</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.transactions.map((t: Txn) => (
                      <TableRow key={t._id}>
                        <TableCell className="text-sm">{TXN_VI[t.type] ?? t.type}</TableCell>
                        <TableCell className="text-sm">{t.description}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {t.type === 'earning' || t.type === 'refund' ? '+' : '−'}
                          {formatVND(t.amount)}
                        </TableCell>
                        <TableCell className="text-sm">{t.status}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(t.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nhận được (với vai trò thợ)</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewList reviews={data.reviews_received} by="customer_id" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Đã viết (với vai trò khách)</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewList reviews={data.reviews_written} by="helper_id" />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

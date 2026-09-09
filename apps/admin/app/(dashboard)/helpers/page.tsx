'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminHelpers } from '@/hooks/use-admin';
import {
  Badge,
  Button,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Loading,
  EmptyState,
  Pagination,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { ShieldCheck } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'unsubmitted', label: 'Chưa nộp hồ sơ' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Bị từ chối' },
];

const KYC_BADGE: Record<string, 'success' | 'danger' | 'warning' | 'secondary'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  unsubmitted: 'secondary',
};

const KYC_VI: Record<string, string> = {
  approved: 'Đã duyệt',
  pending: 'Chờ duyệt',
  rejected: 'Từ chối',
  unsubmitted: 'Chưa nộp',
};

const HELPER_STATUS_BADGE: Record<string, 'success' | 'warning' | 'secondary'> = {
  online: 'success',
  busy: 'warning',
  offline: 'secondary',
};

export default function HelpersPage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminHelpers({ search, status, page });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Người giúp việc</h1>
          <p className="text-muted-foreground">
            Tổng cộng{' '}
            <span className="font-semibold text-foreground">{data?.total ?? 0}</span> helper
          </p>
        </div>
        <Link href="/helpers/kyc">
          <Button>
            <ShieldCheck className="mr-2 h-4 w-4" />
            KYC chờ duyệt
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Tìm kiếm tên, SĐT..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={e => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-48"
        />
        <Button type="submit" variant="outline">
          Tìm kiếm
        </Button>
      </form>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <Loading />
        ) : !data?.helpers?.length ? (
          <EmptyState message="Không tìm thấy helper nào" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Helper</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>KYC</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Đã hoàn thành</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.helpers.map(
                  (h: {
                    _id: string;
                    user_id: { _id: string; full_name: string; phone: string } | null;
                    status: string;
                    verification_status: string;
                    average_rating: number;
                    total_completed: number;
                    created_at: string;
                  }) => (
                    <TableRow key={h._id}>
                      <TableCell>
                        <p className="font-medium">{h.user_id?.full_name ?? '—'}</p>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{h.user_id?.phone ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={HELPER_STATUS_BADGE[h.status] ?? 'secondary'}>
                          {h.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={KYC_BADGE[h.verification_status] ?? 'secondary'}>
                          {KYC_VI[h.verification_status] ?? h.verification_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {h.average_rating ? (
                          <span className="text-yellow-600 font-medium">
                            ★ {h.average_rating.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>{h.total_completed ?? 0} jobs</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(h.created_at)}
                      </TableCell>
                    </TableRow>
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

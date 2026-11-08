'use client';

import { useState } from 'react';
import { useAdminJobs } from '@/hooks/use-admin';
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
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import { STATUS_BADGE, STATUS_VI } from './status';

const JOB_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'draft', label: 'Nháp' },
  { value: 'open', label: 'Mở' },
  { value: 'receiving_quotes', label: 'Nhận báo giá' },
  { value: 'quote_selected', label: 'Đã chọn báo giá' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'helper_on_the_way', label: 'Thợ trên đường' },
  { value: 'helper_arrived', label: 'Thợ đã đến' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'pending_review', label: 'Chờ nghiệm thu' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: 'disputed', label: 'Tranh chấp' },
  { value: 'expired', label: 'Đã hết hạn' },
  { value: 'refunded', label: 'Đã hoàn tiền' },
];

export default function JobsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useAdminJobs({ status, search, page });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Quản lý Jobs</h1>
        <p className="text-muted-foreground">
          Tổng cộng <span className="font-semibold text-foreground">{data?.total ?? 0}</span> jobs
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Tìm theo tiêu đề, địa chỉ..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          options={JOB_STATUS_OPTIONS}
          value={status}
          onChange={e => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-52"
        />
        <Button type="submit" variant="outline">
          Tìm kiếm
        </Button>
      </form>

      <div className="rounded-lg border bg-card overflow-hidden max-w-full">
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-destructive font-medium">
              Không thể tải danh sách đơn hàng. Vui lòng thử lại.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tải lại
            </Button>
          </div>
        ) : !data?.jobs?.length ? (
          <EmptyState message="Không tìm thấy job nào" />
        ) : (
          <>
            <div className="overflow-x-auto w-full">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tiêu đề</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Helper</TableHead>
                    <TableHead>Dịch vụ</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.jobs.map(
                    (job: {
                      _id: string;
                      title: string;
                      customer_id: { full_name: string; phone: string } | null;
                      helper_id: { full_name: string; phone: string } | null;
                      service_id: { name: string } | null;
                      custom_service_name?: string;
                      status: string;
                      address: { district: string; city: string };
                      created_at: string;
                    }) => (
                      <TableRow key={job._id}>
                        <TableCell>
                          <div>
                            <Link
                              href={`/jobs/${job._id}`}
                              className="block font-medium max-w-[200px] truncate hover:underline"
                            >
                              {job.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {job.address?.district}, {job.address?.city}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{job.customer_id?.full_name ?? '—'}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {job.customer_id?.phone}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {job.helper_id ? (
                            <div>
                              <p className="text-sm">{job.helper_id.full_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {job.helper_id.phone}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {job.service_id?.name || job.custom_service_name || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[job.status] ?? 'secondary'}>
                            {STATUS_VI[job.status] ?? job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(job.created_at)}
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalPages={data.total_pages ?? 1} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useAdminUsers, useSuspendUser, useActivateUser } from '@/hooks/use-admin';
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

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'inactive', label: 'Chưa kích hoạt' },
  { value: 'suspended', label: 'Bị đình chỉ' },
];

const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning' | 'secondary'> = {
  active: 'success',
  inactive: 'secondary',
  suspended: 'danger',
  pending_verification: 'warning',
};

const STATUS_VI: Record<string, string> = {
  active: 'Hoạt động',
  inactive: 'Chưa KT',
  suspended: 'Đình chỉ',
  pending_verification: 'Chờ xác minh',
};

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading } = useAdminUsers({ search, status, page });
  const suspend = useSuspendUser();
  const activate = useActivateUser();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Quản lý người dùng</h1>
        <p className="text-muted-foreground">
          Tổng cộng <span className="font-semibold text-foreground">{data?.total ?? 0}</span> người
          dùng
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Tìm kiếm tên, SĐT, email..."
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
        {(search || status) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setStatus('');
              setPage(1);
            }}
          >
            Xóa bộ lọc
          </Button>
        )}
      </form>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <Loading />
        ) : !data?.users?.length ? (
          <EmptyState message="Không tìm thấy người dùng nào" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map(
                  (user: {
                    _id: string;
                    full_name: string;
                    email?: string;
                    phone: string;
                    roles: string[];
                    status: string;
                    created_at: string;
                  }) => (
                    <TableRow key={user._id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.full_name}</p>
                          {user.email && (
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{user.phone}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {user.roles.map(r => (
                            <Badge key={r} variant="outline">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[user.status] ?? 'secondary'}>
                          {STATUS_VI[user.status] ?? user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(user.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.status === 'suspended' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={activate.isPending}
                            onClick={() => activate.mutate(user._id)}
                          >
                            Kích hoạt
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            loading={suspend.isPending}
                            onClick={() => suspend.mutate({ id: user._id })}
                          >
                            Đình chỉ
                          </Button>
                        )}
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

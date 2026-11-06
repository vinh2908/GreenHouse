'use client';

import { useState } from 'react';
import { useBroadcast, useAdminSentNotifications } from '@/hooks/use-admin';
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
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

export default function BroadcastPage() {
  const broadcast = useBroadcast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [page, setPage] = useState(1);
  const { data: history, isLoading: historyLoading } = useAdminSentNotifications({ page });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('Gửi thông báo này tới TẤT CẢ người dùng?')) return;
    broadcast.mutate(
      { title: title.trim(), body: body.trim() },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gửi thông báo</h1>
        <p className="text-muted-foreground">
          Thông báo hệ thống hiển thị trong mục Thông báo của mọi người dùng
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nội dung</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Tiêu đề"
              value={title}
              maxLength={120}
              onChange={e => setTitle(e.target.value)}
              required
            />
            <div className="space-y-1">
              <label htmlFor="body" className="text-sm font-medium leading-none">
                Nội dung
              </label>
              <textarea
                id="body"
                value={body}
                maxLength={1000}
                onChange={e => setBody(e.target.value)}
                required
                rows={5}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {broadcast.isSuccess && (
              <p className="text-sm text-green-600">Đã gửi tới {broadcast.data.sent} người dùng.</p>
            )}
            {broadcast.isError && (
              <p className="text-sm text-destructive">Gửi thất bại, thử lại sau.</p>
            )}
            <Button type="submit" disabled={broadcast.isPending || !title.trim() || !body.trim()}>
              {broadcast.isPending ? 'Đang gửi…' : 'Gửi tới tất cả'}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>

      {/* B108: lịch sử thông báo đã gửi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lịch sử đã gửi</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <Loading />
          ) : !history?.notifications?.length ? (
            <EmptyState message="Chưa có thông báo nào được gửi" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nội dung</TableHead>
                    <TableHead>Người nhận</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.notifications.map((n: any) => (
                    <TableRow key={n._id}>
                      <TableCell>
                        <div className="font-medium">{n.title}</div>
                        <div className="text-sm text-muted-foreground line-clamp-2">{n.body}</div>
                        <div className="text-xs text-muted-foreground">{n.type}</div>
                      </TableCell>
                      <TableCell>
                        {n.user_id?.full_name ?? n.user_id?.phone ?? n.user_id?.email ?? '—'}
                        {n.user_id?.phone ? (
                          <div className="text-xs text-muted-foreground">{n.user_id.phone}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(n.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={n.is_read ? 'success' : 'warning'}>
                          {n.is_read ? 'Đã đọc' : 'Chưa đọc'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {history.total_pages > 1 && (
                <Pagination
                  page={history.page}
                  totalPages={history.total_pages}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

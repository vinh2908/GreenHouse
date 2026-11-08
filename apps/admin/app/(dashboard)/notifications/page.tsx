'use client';

import { useState, useMemo } from 'react';
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
import { PromptDialog } from '@/components/common/prompt-dialog';

interface GroupedNotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  recipient_count: number;
  sample_recipient: string;
  created_at: string;
}

export default function BroadcastPage() {
  const broadcast = useBroadcast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [page, setPage] = useState(1);
  // B106: xác nhận bằng PromptDialog thay cho hộp thoại confirm của trình duyệt.
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useAdminSentNotifications({ page, type: 'system', grouped: true });

  const groupedNotifications: GroupedNotificationItem[] = useMemo(() => {
    if (!history?.notifications) return [];
    return history.notifications.map((n: any) => ({
      id: String(n._id),
      title: n.title,
      body: n.body,
      type: n.type,
      recipient_count: n.recipient_count ?? 1,
      sample_recipient: n.user_id?.full_name || n.user_id?.phone || 'Toàn hệ thống',
      created_at: n.created_at,
    }));
  }, [history]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmBroadcast(true);
  };

  const sendBroadcast = () => {
    setConfirmBroadcast(false);
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
                <p className="text-sm text-green-600">
                  Đã gửi tới {broadcast.data.sent} người dùng.
                </p>
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
          ) : historyError ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-destructive font-medium">Không thể tải lịch sử thông báo</p>
              <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                Tải lại
              </Button>
            </div>
          ) : !groupedNotifications.length ? (
            <EmptyState message="Chưa có thông báo nào được gửi" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nội dung</TableHead>
                    <TableHead>Người nhận / Quy mô</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Loại</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedNotifications.map(n => (
                    <TableRow key={n.id}>
                      <TableCell>
                        <div className="font-medium">{n.title}</div>
                        <div className="text-sm text-muted-foreground line-clamp-2">{n.body}</div>
                      </TableCell>
                      <TableCell>
                        {n.recipient_count > 1 ? (
                          <div>
                            <span className="font-semibold text-primary">
                              {n.recipient_count} người nhận
                            </span>
                            <div className="text-xs text-muted-foreground">
                              Đợt gửi thông báo toàn hệ thống
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="font-medium">{n.sample_recipient}</span>
                            <div className="text-xs text-muted-foreground">1 người nhận</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(n.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={n.type === 'broadcast' ? 'default' : 'secondary'}>
                          {n.type === 'broadcast' ? 'Quảng bá' : n.type}
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

      {confirmBroadcast && (
        <PromptDialog
          title="Gửi thông báo"
          message="Gửi thông báo này tới TẤT CẢ người dùng?"
          confirmLabel="Gửi tới tất cả"
          requireInput={false}
          onSubmit={sendBroadcast}
          onClose={() => setConfirmBroadcast(false)}
        />
      )}
    </div>
  );
}

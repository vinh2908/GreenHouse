'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Loading,
  Pagination,
  Select,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

interface FeedbackItem {
  _id: string;
  user_id?: {
    _id?: string;
    full_name?: string;
    phone?: string;
    email?: string;
  };
  message: string;
  status: 'open' | 'resolved';
  createdAt?: string;
  created_at?: string;
}

export default function FeedbackPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'feedback', { status, page }],
    queryFn: async () => {
      const res = await apiClient.get('/feedback/admin', {
        params: {
          status: status === 'all' ? undefined : status,
          page,
          limit: 20,
        },
      });
      const resData = res.data.data;
      if (Array.isArray(resData)) {
        return { items: resData as FeedbackItem[], total: resData.length, total_pages: 1 };
      }
      return resData as { items: FeedbackItem[]; total: number; total_pages: number };
    },
  });

  const update = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/feedback/${id}/status`, { status: 'resolved' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Góp ý ứng dụng</h1>
          <p className="text-sm text-muted-foreground">
            Ý kiến phản hồi và đóng góp từ khách hàng và thợ ({data?.total ?? 0} góp ý)
          </p>
        </div>
        <div className="w-48">
          <Select
            value={status}
            onChange={e => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'open', label: 'Chờ xử lý' },
              { value: 'resolved', label: 'Đã xử lý' },
              { value: 'all', label: 'Tất cả trạng thái' },
            ]}
          />
        </div>
      </div>

      {update.isError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          Chưa cập nhật được trạng thái góp ý. Vui lòng thử lại.
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loading />
        </div>
      ) : isError ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-destructive font-medium">Không thể tải danh sách góp ý.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tải lại
          </Button>
        </div>
      ) : !items.length ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState message="Không có góp ý nào phù hợp với bộ lọc." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item: FeedbackItem) => {
            const dateStr = item.createdAt || item.created_at;
            return (
              <Card key={item._id}>
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {item.user_id?.full_name || 'Người dùng'}
                    </span>
                    {(item.user_id?.phone || item.user_id?.email) && (
                      <span className="text-xs text-muted-foreground">
                        ({item.user_id.phone || item.user_id.email})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dateStr && (
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(dateStr)}
                      </span>
                    )}
                    <Badge variant={item.status === 'resolved' ? 'success' : 'warning'}>
                      {item.status === 'resolved' ? 'Đã xử lý' : 'Đang chờ xử lý'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-sm whitespace-pre-wrap break-words flex-1">{item.message}</p>
                  {item.status === 'open' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={update.isPending}
                      onClick={() => update.mutate(item._id)}
                    >
                      Đánh dấu đã xử lý
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {data && data.total_pages > 1 && (
            <Pagination page={page} totalPages={data.total_pages} onPageChange={setPage} />
          )}
        </div>
      )}
    </div>
  );
}

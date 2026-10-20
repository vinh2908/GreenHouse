'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface FeedbackItem {
  _id: string;
  user_id?: {
    full_name?: string;
  };
  message: string;
  status: 'open' | 'resolved';
}

export default function FeedbackPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'feedback'],
    queryFn: async () => (await apiClient.get('/feedback/admin')).data.data,
  });
  const update = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/feedback/${id}/status`, { status: 'resolved' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Góp ý ứng dụng</h1>
      <p>100 góp ý gần nhất từ khách hàng và thợ.</p>
      {isLoading && <p>Đang tải…</p>}
      {isError && <button onClick={() => refetch()}>Tải lại góp ý</button>}
      {update.isError && <p role="alert">Chưa cập nhật được. Vui lòng thử lại.</p>}
      {data?.length === 0 && <p>Chưa có góp ý.</p>}
      {data?.map((item: FeedbackItem) => (
        <div key={item._id} className="border rounded-lg p-4 space-y-2">
          <p className="font-semibold">{item.user_id?.full_name || 'Người dùng'}</p>
          <p className="whitespace-pre-wrap break-words">{item.message}</p>
          <p>{item.status === 'resolved' ? 'Đã xử lý' : 'Đang chờ xử lý'}</p>
          {item.status === 'open' && (
            <button
              className="border rounded px-3 py-2"
              disabled={update.isPending}
              onClick={() => update.mutate(item._id)}
            >
              Đánh dấu đã xử lý
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

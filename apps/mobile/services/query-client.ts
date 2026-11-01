import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 phút lưu cache không fetch lại nếu không cần thiết
      gcTime: 30 * 60 * 1000, // 30 phút giữ dữ liệu trong bộ nhớ (stale-while-revalidate)
      refetchOnWindowFocus: false, // Không tự refetch khi chuyển qua lại app/tab
      refetchIntervalInBackground: false, // DỪNG toàn bộ tải nền khi app xuống background
      refetchOnReconnect: true,
    },
  },
});

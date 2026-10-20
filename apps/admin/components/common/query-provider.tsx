'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<{ message: string; canRetry: boolean } | null>(null);
  const describe = (error: unknown) => {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message;
    return typeof message === 'string' ? message : 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  };
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: error => setNotice({ message: describe(error), canRetry: true }),
        }),
        mutationCache: new MutationCache({
          onError: error => setNotice({ message: describe(error), canRetry: false }),
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {notice && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-[100] max-w-md rounded-lg border border-red-200 bg-white p-4 shadow-lg"
        >
          <p className="font-semibold text-red-700">Chưa thực hiện được yêu cầu</p>
          <p className="mt-1 text-sm">{notice.message}</p>
          <div className="mt-3 flex gap-4">
            {notice.canRetry && (
              <button
                onClick={() => {
                  setNotice(null);
                  queryClient.invalidateQueries();
                }}
              >
                Tải lại dữ liệu
              </button>
            )}
            <button onClick={() => setNotice(null)}>Đóng thông báo</button>
          </div>
        </div>
      )}
      {children}
    </QueryClientProvider>
  );
}

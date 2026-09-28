// hooks/use-api.ts — TanStack Query hooks cho toàn bộ app
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { uploadFile, uploadFiles } from '@/services/upload.service';
import Toast from 'react-native-toast-message';

// ─── Auth ──────────────────────────────────────────────────────────────────────

export function useLogin() {
  return useMutation({
    mutationFn: (data: { phone: string; password: string }) => apiClient.post('/auth/login', data),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: { phone: string; full_name: string; password: string; email?: string }) =>
      apiClient.post('/auth/register', data),
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: (data: { phone: string; otp: string }) => apiClient.post('/auth/otp/verify', data),
  });
}

export function useResendOtp() {
  return useMutation({
    mutationFn: (phone: string) => apiClient.post('/auth/otp/send', { phone }),
  });
}

// ─── Profile ───────────────────────────────────────────────────────────────────

export function useMyProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/users/me');
      return data.data;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { full_name?: string; email?: string; avatar?: string }) =>
      apiClient.patch('/users/me', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      Toast.show({ type: 'success', text1: 'Cập nhật thành công' });
    },
  });
}

export function useSwitchRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activeRole: 'customer' | 'helper') =>
      apiClient.patch('/users/me/role', { active_role: activeRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}

// ─── Services ──────────────────────────────────────────────────────────────────

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data } = await apiClient.get('/services');
      return data.data as {
        _id: string;
        name: string;
        slug: string;
        icon?: string;
        description?: string;
        base_price_min?: number;
        base_price_max?: number;
      }[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Jobs (Customer) ───────────────────────────────────────────────────────────

export function useMyJobs(status?: string) {
  return useQuery({
    queryKey: ['jobs', 'my', status],
    queryFn: async () => {
      const { data } = await apiClient.get('/jobs/my', { params: { status } });
      return data.data;
    },
  });
}

export function useJobDetail(jobId?: string) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/jobs/${jobId}`);
      return data.data;
    },
    enabled: !!jobId,
  });
}

export function useJobQuotes(jobId?: string) {
  return useQuery({
    queryKey: ['job', jobId, 'quotes'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/jobs/${jobId}/quotes`);
      return data.data;
    },
    enabled: !!jobId,
    refetchInterval: 15000, // Poll mỗi 15s
  });
}

export function useJobContract(jobId?: string) {
  return useQuery({
    queryKey: ['job', jobId, 'contract'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/jobs/${jobId}/contract`);
      return data.data;
    },
    enabled: !!jobId,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: any) =>
      apiClient.post('/jobs', {
        ...dto,
        photos: await uploadFiles(dto?.photos),
        videos: await uploadFiles(dto?.videos),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      Toast.show({
        type: 'success',
        text1: 'Đăng việc thành công!',
        text2: 'Đang phát thông báo tới các thợ trong khu vực',
      });
    },
  });
}

export function useCreateSosJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      category: string;
      title: string;
      description: string;
      address: any;
      surcharge?: number;
      photos?: string[];
    }) => uploadFiles(dto.photos).then(photos => apiClient.post('/jobs/sos', { ...dto, photos })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
    },
  });
}

export function useAcceptSosJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.post(`/jobs/${jobId}/sos-accept`),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      Toast.show({
        type: 'success',
        text1: '🚨 BẠN ĐÃ NHẬN ĐƠN CỨU HỘ SOS!',
        text2: 'Vui lòng di chuyển khẩn cấp đến địa chỉ khách hàng',
      });
    },
  });
}

export function useSelectQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, ...dto }: { jobId: string; quote_id: string; scheduled_at: string }) =>
      apiClient.post(`/jobs/${jobId}/select-quote`, dto),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      Toast.show({
        type: 'success',
        text1: 'Đã chọn helper!',
        text2: 'Cuộc trò chuyện đã được tạo',
      });
    },
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, reason }: { jobId: string; reason: string }) =>
      apiClient.patch(`/jobs/${jobId}/cancel`, { reason }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
    },
  });
}

export function useApproveJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, rating, review }: { jobId: string; rating: number; review?: string }) =>
      apiClient.patch(`/jobs/${jobId}/approve`, { rating, review }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      Toast.show({
        type: 'success',
        text1: 'Nghiệm thu thành công!',
        text2: 'Cảm ơn bạn đã đánh giá',
      });
    },
  });
}

// ─── Jobs (Helper) ─────────────────────────────────────────────────────────────

export function useAvailableJobs(serviceId?: string, page = 1) {
  return useQuery({
    queryKey: ['jobs', 'available', serviceId, page],
    queryFn: async () => {
      const { data } = await apiClient.get('/jobs/available', {
        params: { service_id: serviceId, page },
      });
      return data.data;
    },
    refetchInterval: 30000, // Refresh mỗi 30s
  });
}

export function useHelperJobs(status?: string) {
  return useQuery({
    queryKey: ['jobs', 'helper', status],
    queryFn: async () => {
      const { data } = await apiClient.get('/jobs/helper/my', { params: { status } });
      return data.data;
    },
  });
}

export function useSubmitQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      ...dto
    }: {
      jobId: string;
      labor_cost: number;
      estimated_duration: number;
      notes?: string;
      available_date?: string;
    }) => apiClient.post(`/jobs/${jobId}/quotes`, dto),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useHelperOnTheWay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.patch(`/jobs/${jobId}/on-the-way`),
    onSuccess: (_, jobId) => qc.invalidateQueries({ queryKey: ['job', jobId] }),
  });
}

export function useHelperArrived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.patch(`/jobs/${jobId}/arrived`),
    onSuccess: (_, jobId) => qc.invalidateQueries({ queryKey: ['job', jobId] }),
  });
}

export function useStartJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.patch(`/jobs/${jobId}/start`),
    onSuccess: (_, jobId) => qc.invalidateQueries({ queryKey: ['job', jobId] }),
  });
}

export function useCompleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      completion_photos,
      completion_videos,
      completion_notes,
    }: {
      jobId: string;
      completion_photos?: string[];
      completion_videos?: string[];
      completion_notes?: string;
    }) =>
      Promise.all([uploadFiles(completion_photos), uploadFiles(completion_videos)]).then(
        ([photos, videos]) =>
          apiClient.patch(`/jobs/${jobId}/complete`, {
            completion_photos: photos,
            completion_videos: videos,
            completion_notes,
          }),
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      Toast.show({
        type: 'success',
        text1: 'Đã gửi bằng chứng hoàn thành!',
        text2: 'Đang chờ khách hàng kiểm tra & nghiệm thu',
      });
    },
  });
}

// ─── Helper Profile ────────────────────────────────────────────────────────────

export function useHelperProfile() {
  return useQuery({
    queryKey: ['helper', 'profile'],
    queryFn: async () => {
      const { data } = await apiClient.get('/helpers/me/profile');
      return data.data;
    },
  });
}

export function useSetHelperStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: 'online' | 'offline') => apiClient.patch('/helpers/me/status', { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['helper', 'profile'] }),
  });
}

export function useSubmitKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      id_card_number: string;
      id_card_front: string;
      id_card_back: string;
      selfie_photo: string;
    }) =>
      Promise.all([
        uploadFile(dto.id_card_front),
        uploadFile(dto.id_card_back),
        uploadFile(dto.selfie_photo),
      ]).then(([id_card_front, id_card_back, selfie_photo]) =>
        apiClient.post('/helpers/me/kyc', { ...dto, id_card_front, id_card_back, selfie_photo }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['helper', 'profile'] });
      Toast.show({
        type: 'success',
        text1: 'Nộp hồ sơ e-KYC thành công!',
        text2: 'Hồ sơ đang được xét duyệt trong 24h',
      });
    },
  });
}

export function useUpdateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { bank_name: string; account_number: string; account_name: string }) =>
      apiClient.put('/helpers/me/bank-account', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['helper', 'profile'] });
      Toast.show({ type: 'success', text1: 'Cập nhật tài khoản ngân hàng thành công!' });
    },
  });
}

export function useHelperPublicProfile(userId?: string) {
  return useQuery({
    queryKey: ['helper', 'public', userId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/helpers/${userId}/profile`);
      return data.data;
    },
    enabled: !!userId,
  });
}

export function useHelperReviews(helperId?: string) {
  return useQuery({
    queryKey: ['helper', 'reviews', helperId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/reviews/helpers/${helperId}`);
      return data.data;
    },
    enabled: !!helperId,
  });
}

// ─── Wallet & Payments ─────────────────────────────────────────────────────────

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      const { data } = await apiClient.get('/payments/wallet');
      return data.data;
    },
  });
}

export function useTransactions(page = 1) {
  return useQuery({
    queryKey: ['transactions', page],
    queryFn: async () => {
      const { data } = await apiClient.get('/payments/transactions', { params: { page } });
      return data.data;
    },
  });
}

export function useRequestWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      amount: number;
      bank_account?: { bank_name: string; account_number: string; account_name: string };
    }) => apiClient.post('/payments/withdraw', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      Toast.show({
        type: 'success',
        text1: 'Yêu cầu rút tiền đã gửi!',
        text2: 'Sẽ được xử lý trong 1-3 ngày làm việc',
      });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Rút tiền thất bại';
      Toast.show({ type: 'error', text1: msg });
    },
  });
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data } = await apiClient.get('/chat/conversations');
      return data.data;
    },
    refetchInterval: 10000,
  });
}

export function useMessages(conversationId?: string, page = 1) {
  return useQuery({
    queryKey: ['messages', conversationId, page],
    queryFn: async () => {
      const { data } = await apiClient.get(`/chat/conversations/${conversationId}/messages`, {
        params: { page, limit: 30 },
      });
      return data.data;
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      apiClient.post(`/chat/conversations/${conversationId}/messages`, { content }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['messages', vars.conversationId] });
    },
  });
}

// ─── Notifications ─────────────────────────────────────────────────────────────

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications', {
        params: { unread_only: unreadOnly },
      });
      return data.data;
    },
    refetchInterval: 30000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications/unread-count');
      return data.data.count as number;
    },
    refetchInterval: 15000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      apiClient.patch(`/notifications/${notificationId}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
    },
  });
}

// ─── Customer Profile ──────────────────────────────────────────────────────────

export function useCustomerProfile() {
  return useQuery({
    queryKey: ['customer', 'profile'],
    queryFn: async () => {
      const { data } = await apiClient.get('/customers/me/profile');
      return data.data;
    },
  });
}

export function useAddresses() {
  return useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const { data } = await apiClient.get('/customers/me/addresses');
      return data.data;
    },
  });
}

export function useAddAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: unknown) => apiClient.post('/customers/me/addresses', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      Toast.show({ type: 'success', text1: 'Đã thêm địa chỉ' });
    },
  });
}

// ─── AI ────────────────────────────────────────────────────────────────────────

export function useAnalyzeBooking() {
  return useMutation({
    mutationFn: (text: string) => apiClient.post('/ai/booking/analyze', { text }),
  });
}

export function useEstimatePrice() {
  return useMutation({
    mutationFn: (dto: { description: string; service_type?: string }) =>
      apiClient.post('/ai/price/estimate', dto),
  });
}

export function useAiSupport() {
  return useMutation({
    mutationFn: (dto: { message: string; history?: { role: string; content: string }[] }) =>
      apiClient.post('/ai/support/chat', dto),
  });
}

// ─── Reviews ───────────────────────────────────────────────────────────────────

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      job_id: string;
      helper_id: string;
      rating: number;
      comment?: string;
      tags?: string[];
    }) => apiClient.post('/reviews', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      Toast.show({ type: 'success', text1: 'Đánh giá thành công!' });
    },
  });
}

// hooks/use-api.ts — TanStack Query hooks cho toàn bộ app
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { uploadFile, uploadFiles } from '@/services/upload.service';
import { syncHelperLocation } from '@/hooks/use-helper-location-sync';
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

export function useForgotPassword() {
  return useMutation({
    mutationFn: (phone: string) => apiClient.post('/auth/forgot-password', { phone }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: { phone: string; otp: string; new_password: string }) =>
      apiClient.post('/auth/reset-password', data),
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
    mutationFn: (dto: {
      full_name?: string;
      email?: string;
      avatar?: string;
      gender?: 'male' | 'female' | 'other';
    }) => apiClient.patch('/users/me', dto),
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

// ─── Jobs (Customer & Helper) ──────────────────────────────────────────────────

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
    refetchInterval: 15000,
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
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, data }: { jobId: string; data: any }) =>
      apiClient.patch(`/jobs/${jobId}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useApproveJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      rating,
      review,
      payment_method,
    }: {
      jobId: string;
      rating: number;
      review?: string;
      payment_method?: string;
    }) => apiClient.patch(`/jobs/${jobId}/approve`, { rating, review, payment_method }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      Toast.show({
        type: 'success',
        text1: 'Nghiệm thu thành công!',
        text2: 'Cảm ơn bạn đã đánh giá',
      });
    },
  });
}

export function useOpenDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      reason,
      photos,
      evidence_photos,
    }: {
      jobId: string;
      reason: string;
      photos?: string[];
      evidence_photos?: string[];
    }) => {
      const photoList = photos || evidence_photos;
      const uploadedPhotos = await uploadFiles(photoList);
      return apiClient.post(`/jobs/${jobId}/dispute`, {
        reason,
        photos: uploadedPhotos,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      Toast.show({
        type: 'info',
        text1: 'Đã gửi khiếu nại lên Ban quản trị',
        text2: 'Admin sẽ kiểm tra bằng chứng và phản hồi sớm nhất',
      });
    },
  });
}

export function useProposeAmendment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      additional_labor_cost,
      additional_materials_cost,
      reason,
      photos,
    }: {
      jobId: string;
      additional_labor_cost?: number;
      additional_materials_cost?: number;
      reason: string;
      photos?: string[];
    }) => {
      const uploaded = await uploadFiles(photos);
      return apiClient.post(`/jobs/${jobId}/contract/amendments`, {
        additional_labor_cost,
        additional_materials_cost,
        reason,
        photos: uploaded,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId, 'contract'] });
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      Toast.show({
        type: 'success',
        text1: 'Đã gửi đề xuất phát sinh chi phí',
        text2: 'Chờ khách hàng xác nhận trên ứng dụng',
      });
    },
  });
}

export function useRespondAmendment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      amendmentId,
      action,
      decision,
    }: {
      jobId: string;
      amendmentId: string;
      action?: 'accept' | 'reject';
      decision?: 'accept' | 'reject';
    }) =>
      apiClient.patch(`/jobs/${jobId}/contract/amendments/${amendmentId}`, {
        action: action || decision || 'reject',
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId, 'contract'] });
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      Toast.show({
        type: 'success',
        text1:
          vars.action === 'accept' ? 'Đã duyệt phụ lục hợp đồng' : 'Đã từ chối khoản phát sinh',
      });
    },
  });
}

// ─── Jobs (Helper) ─────────────────────────────────────────────────────────────

export function useAvailableJobs(serviceId?: string, page = 1, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['jobs', 'available', serviceId, page],
    queryFn: async () => {
      const { data } = await apiClient.get('/jobs/available', {
        params: { service_id: serviceId, page },
      });
      return data.data;
    },
    refetchInterval: 30000,
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
      materials_cost?: number;
      estimated_duration: number;
      notes?: string;
      available_date?: string;
    }) => {
      syncHelperLocation();
      return apiClient.post(`/jobs/${jobId}/quotes`, dto);
    },
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
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useHelperArrived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.patch(`/jobs/${jobId}/arrived`),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
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

export function useUpdateHelperLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      loc: [number, number] | { coordinates: [number, number]; source: 'manual' | 'gps' },
    ) =>
      apiClient.patch(
        '/helpers/me/location',
        Array.isArray(loc) ? { coordinates: loc, source: 'auto' } : loc,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['helper', 'profile'] });
      qc.invalidateQueries({ queryKey: ['helper', 'public'] });
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

export function useTopupWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { amount: number; payment_method?: string }) =>
      apiClient.post('/payments/wallet/topup', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      Toast.show({
        type: 'success',
        text1: 'Nạp tiền vào ví ký quỹ thành công!',
      });
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

export function usePayJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { job_id: string; payment_method: string }) =>
      apiClient.post('/payments/pay', dto),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.job_id] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
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
      qc.invalidateQueries({ queryKey: ['transactions'] });
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

// ─── Favorites (Roadmap Phase 1 — Thợ yêu thích) ─────────────────────────────

export interface FavoriteHelperItem {
  _id: string;
  helper_id: string | { _id: string; full_name?: string; phone?: string; avatar?: string };
  helper_profile?: {
    rating?: number;
    total_reviews?: number;
    completed_jobs?: number;
    years_experience?: number;
    verification_status?: string;
    status?: string;
  } | null;
  created_at: string;
}

export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const { data } = await apiClient.get('/customers/me/favorites');
      return data.data as FavoriteHelperItem[];
    },
  });
}

export function useAddFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (helperId: string) =>
      apiClient.post('/customers/me/favorites', { helper_id: helperId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['favorites'] });
      Toast.show({ type: 'success', text1: 'Đã thêm vào thợ yêu thích ❤️' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Không thể thêm thợ yêu thích';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (helperId: string) => apiClient.delete(`/customers/me/favorites/${helperId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['favorites'] });
      Toast.show({ type: 'success', text1: 'Đã bỏ khỏi danh sách yêu thích' });
    },
  });
}

export function useLastCompletedJobWithHelper(helperId?: string) {
  return useQuery({
    queryKey: ['favorites', 'last-job', helperId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/customers/me/favorites/${helperId}/last-completed-job`,
      );
      return data.data;
    },
    enabled: !!helperId,
    retry: false,
  });
}

export function useRebookJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceJobId,
      ...dto
    }: {
      sourceJobId: string;
      preferred_date?: string;
      preferred_time_start?: string;
      private_offer?: boolean;
      private_offer_hours?: number;
    }) => apiClient.post(`/jobs/rebook/${sourceJobId}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      Toast.show({
        type: 'success',
        text1: 'Đã đặt lại việc thành công!',
        text2: 'Đơn mới đang ưu tiên cho thợ quen của bạn',
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Đặt lại thất bại';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đặt lại thất bại' });
    },
  });
}

export function useReleasePrivateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.patch(`/jobs/${jobId}/release-offer`),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      Toast.show({
        type: 'success',
        text1: 'Đã mở công khai đơn hàng',
        text2: 'Tất cả thợ gần bạn giờ có thể gửi báo giá',
      });
    },
  });
}

// ─── Recurring Plans (Roadmap Phase 1 — Gói định kỳ) ────────────────────────

export interface RecurringPlanItem {
  _id: string;
  service_id: string | { _id: string; name?: string; icon?: string };
  title: string;
  description: string;
  frequency: 'weekly' | 'monthly';
  weekdays: number[];
  month_days: number[];
  time_start: string;
  time_end?: string;
  duration_hours?: number;
  start_date: string;
  end_date?: string;
  preferred_helper_id?: string | { _id: string; full_name?: string; avatar?: string };
  status: 'active' | 'paused' | 'cancelled';
  skipped_dates: string[];
  next_occurrence_at?: string;
  jobs_generated: number;
  created_at: string;
}

export function useRecurringPlans() {
  return useQuery({
    queryKey: ['recurring-plans'],
    queryFn: async () => {
      const { data } = await apiClient.get('/recurring-plans');
      return data.data as RecurringPlanItem[];
    },
  });
}

export function useRecurringPlanDetail(planId?: string) {
  return useQuery({
    queryKey: ['recurring-plans', planId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/recurring-plans/${planId}`);
      return data.data as { plan: RecurringPlanItem; jobs: any[]; upcoming_dates: string[] };
    },
    enabled: !!planId,
  });
}

export function useCreateRecurringPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: any) =>
      apiClient.post('/recurring-plans', {
        ...dto,
        photos: await uploadFiles(dto?.photos),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-plans'] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      Toast.show({
        type: 'success',
        text1: 'Đã tạo gói định kỳ 🔁',
        text2: 'Hệ thống sẽ tự tạo đơn cho từng buổi sắp tới',
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Tạo gói định kỳ thất bại';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

function usePlanAction(path: string, successText: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiClient.post(`/recurring-plans/${planId}/${path}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-plans'] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      Toast.show({ type: 'success', text1: successText });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Thao tác thất bại';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

export function usePauseRecurringPlan() {
  return usePlanAction('pause', 'Đã tạm dừng gói định kỳ');
}

export function useResumeRecurringPlan() {
  return usePlanAction('resume', 'Đã tiếp tục gói định kỳ');
}

export function useSkipNextOccurrence() {
  return usePlanAction('skip-next', 'Đã bỏ qua buổi gần nhất');
}

export function useCancelRecurringPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiClient.delete(`/recurring-plans/${planId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-plans'] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      Toast.show({ type: 'success', text1: 'Đã hủy gói định kỳ' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Hủy gói thất bại';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

// ─── Vouchers (Roadmap Phase 1 — Mã giảm giá) ────────────────────────────────

export interface VoucherPreview {
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_discount_amount?: number;
  min_order_amount: number;
  discount_amount: number;
  final_amount: number;
}

export function useValidateVoucher() {
  return useMutation({
    mutationFn: async (dto: { code: string; amount?: number }) => {
      const { data } = await apiClient.post('/vouchers/validate', dto);
      return data.data as VoucherPreview;
    },
  });
}

export function useApplyVoucherToJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, code }: { jobId: string; code: string }) =>
      apiClient.post(`/vouchers/jobs/${jobId}/apply`, { code }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      Toast.show({ type: 'success', text1: 'Đã áp mã giảm giá 🎟️' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Không áp được mã giảm giá';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

export function useDetachVoucherFromJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.delete(`/vouchers/jobs/${jobId}`),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      Toast.show({ type: 'success', text1: 'Đã gỡ mã giảm giá' });
    },
  });
}

// ─── Team Jobs (Roadmap Phase 1 — Đơn nhóm) ──────────────────────────────────

export interface TeamInvitation {
  job_id: string;
  title: string;
  status: string;
  address_text?: string;
  scheduled_start?: string;
  helpers_needed: number;
  split_percent: number;
  invited_at?: string;
  lead_id?: string | null;
  customer_id: string;
}

export interface TeamCandidate {
  helper_id: string;
  full_name: string;
  avatar?: string | null;
  rating: number;
  total_reviews: number;
  completed_jobs: number;
  skills: string[];
}

export function useTeamInvitations(enabled = true) {
  return useQuery({
    queryKey: ['team-invitations'],
    queryFn: async () => {
      const { data } = await apiClient.get('/jobs/team/invitations');
      return data.data as TeamInvitation[];
    },
    enabled,
    refetchInterval: 30_000,
  });
}

export function useTeamCandidates(jobId?: string, enabled = true) {
  return useQuery({
    queryKey: ['team-candidates', jobId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/jobs/${jobId}/team/candidates`);
      return data.data as TeamCandidate[];
    },
    enabled: !!jobId && enabled,
  });
}

export function useInviteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      helper_id,
      split_percent,
    }: {
      jobId: string;
      helper_id: string;
      split_percent: number;
    }) => apiClient.post(`/jobs/${jobId}/team/invite`, { helper_id, split_percent }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['team-candidates', vars.jobId] });
      Toast.show({ type: 'success', text1: 'Đã gửi lời mời vào nhóm' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Không gửi được lời mời';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

export function useRespondTeamInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: 'accept' | 'decline' }) =>
      apiClient.patch(`/jobs/${jobId}/team/respond`, { action }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['team-invitations'] });
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['helper-jobs'] });
      Toast.show({
        type: 'success',
        text1: vars.action === 'accept' ? 'Đã nhận lời vào nhóm 🎉' : 'Đã từ chối lời mời',
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Không phản hồi được lời mời';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

// ─── Dispute Cases (Roadmap Phase 1 — Hồ sơ tranh chấp) ─────────────────────

export interface DisputeTimelineEntry {
  kind: 'opened' | 'evidence' | 'note' | 'admin_message' | 'resolution' | 'appeal' | 'appeal_resolved';
  actor_id: string;
  actor_role: string;
  text?: string;
  photos: string[];
  created_at: string;
}

export interface DisputeCaseData {
  _id: string;
  job_id: string;
  customer_id: string;
  helper_id?: string;
  opened_by: string;
  opened_by_role: string;
  status: 'open' | 'resolved' | 'appealed';
  reason: string;
  timeline: DisputeTimelineEntry[];
  resolution?: {
    action: 'refund_full' | 'refund_partial' | 'release_to_helper';
    refund_amount?: number;
    helper_payout?: number;
    admin_note?: string;
    resolved_at?: string;
  };
  resolved_at?: string;
  appeal_deadline?: string;
  appeal?: { by: string; by_role: string; reason: string; created_at: string };
  can_appeal: boolean;
  appeal_window_hours: number;
  created_at: string;
}

export function useDisputeCase(jobId?: string) {
  return useQuery({
    queryKey: ['dispute', jobId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/disputes/job/${jobId}`);
      return data.data as DisputeCaseData;
    },
    enabled: !!jobId,
    retry: false,
  });
}

export function useAddDisputeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      text,
      photos,
    }: {
      jobId: string;
      text?: string;
      photos?: string[];
    }) => {
      const uploaded = await uploadFiles(photos);
      return apiClient.post(`/disputes/job/${jobId}/entries`, { text, photos: uploaded });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['dispute', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      Toast.show({ type: 'success', text1: 'Đã bổ sung vào hồ sơ tranh chấp' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Không gửi được';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

export function useAppealDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, reason }: { jobId: string; reason: string }) =>
      apiClient.post(`/disputes/job/${jobId}/appeal`, { reason }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['dispute', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      Toast.show({
        type: 'success',
        text1: 'Đã gửi kháng cáo',
        text2: 'Admin sẽ xem xét lại hồ sơ và phản hồi sớm nhất',
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Kháng cáo thất bại';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
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

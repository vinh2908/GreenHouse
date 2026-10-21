// hooks/use-api.ts — TanStack Query hooks cho toàn bộ app
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { uploadFile, uploadFiles } from '@/services/upload.service';
import { syncHelperLocation } from '@/hooks/use-helper-location-sync';
import {
  cacheActiveJobs,
  cacheJobDetail,
  enqueueAction,
  getCachedActiveJobs,
  getCachedJobDetail,
  isNetworkError,
  QUEUED_OFFLINE,
  toastQueuedOffline,
} from '@/services/offline.service';
import { useOfflineStore } from '@/stores/offline.store';
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
        price_range_min?: number;
        price_range_max?: number;
        platform_fee_percent?: number;
        pricing_model?: 'quote' | 'fixed'; // Feature 7: giá cam kết
        fixed_price?: number;
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
      try {
        const { data } = await apiClient.get(`/jobs/${jobId}`);
        // Feature 16: lưu cache chi tiết đơn để xem offline
        void cacheJobDetail(data.data);
        useOfflineStore.getState().setFromCache(false);
        return data.data;
      } catch (err) {
        // Mất mạng → trả bản cache (nếu có) thay vì màn hình lỗi
        if (isNetworkError(err) && jobId) {
          const cached = await getCachedJobDetail(jobId);
          if (cached) {
            useOfflineStore.getState().setFromCache(true);
            return cached;
          }
        }
        throw err;
      }
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

/**
 * Feature 7 (Giá cam kết) + Feature 9 (Đơn bảo hành): thợ nhận việc trực tiếp
 * qua POST /jobs/:jobId/accept-fixed — không qua vòng báo giá.
 */
export function useAcceptFixedPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.post(`/jobs/${jobId}/accept-fixed`),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      Toast.show({
        type: 'success',
        text1: 'Đã nhận việc thành công! 🎉',
        text2: 'Hợp đồng đã được tạo — bạn có thể bắt đầu di chuyển đến khách.',
      });
    },
  });
}

/**
 * Feature 9 (Đơn bảo hành 1 chạm): khách tạo đơn bảo hành miễn phí từ đơn gốc
 * đã hoàn thành còn hạn — POST /jobs/:jobId/warranty. Trả về đơn bảo hành mới.
 */
export function useCreateWarrantyJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceJobId: string) => {
      const { data } = await apiClient.post(`/jobs/${sourceJobId}/warranty`);
      return data.data as { _id: string };
    },
    onSuccess: (newJob, sourceJobId) => {
      qc.invalidateQueries({ queryKey: ['job', sourceJobId] });
      qc.invalidateQueries({ queryKey: ['jobs', 'my'] });
      qc.invalidateQueries({ queryKey: ['job', newJob?._id] });
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

// ─── Bản đồ nhu cầu (Roadmap Phase 2 — Feature 15) ──────────────────────────

export interface DemandArea {
  district: string;
  city: string;
  lat: number | null;
  lng: number | null;
  open_jobs: number;
  fixed_price_jobs?: number;
  ai_priced_jobs?: number;
}

export function useDemandMap() {
  return useQuery({
    queryKey: ['jobs', 'demand-map'],
    queryFn: async () => {
      const { data } = await apiClient.get('/jobs/demand-map');
      return data.data as DemandArea[];
    },
    staleTime: 60 * 1000,
  });
}

export function useHelperJobs(status?: string) {
  return useQuery({
    queryKey: ['jobs', 'helper', status],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/jobs/helper/my', { params: { status } });
        // Feature 16: snapshot danh sách đơn đang làm (tab "Đang thực hiện")
        // làm cache offline chính của thợ.
        if (!status || status.includes('confirmed')) {
          void cacheActiveJobs(data.data);
        }
        useOfflineStore.getState().setFromCache(false);
        return data.data;
      } catch (err) {
        // Chỉ fallback cho đúng danh sách đã cache (đơn đang làm) — các tab
        // lọc khác (lịch sử...) không có cache riêng nên giữ nguyên lỗi.
        if (isNetworkError(err) && (!status || status.includes('confirmed'))) {
          const cached = await getCachedActiveJobs();
          if (cached) {
            useOfflineStore.getState().setFromCache(true);
            return cached;
          }
        }
        throw err;
      }
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
    mutationFn: async (jobId: string) => {
      try {
        return await apiClient.patch(`/jobs/${jobId}/on-the-way`);
      } catch (err) {
        // Feature 16: mất mạng → xếp hàng offline, trả sentinel thay vì ném lỗi
        if (isNetworkError(err)) {
          await enqueueAction('on_the_way', jobId);
          toastQueuedOffline();
          return QUEUED_OFFLINE as unknown as Awaited<ReturnType<typeof apiClient.patch>>;
        }
        throw err;
      }
    },
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useHelperArrived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      try {
        return await apiClient.patch(`/jobs/${jobId}/arrived`);
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueueAction('arrived', jobId);
          toastQueuedOffline();
          return QUEUED_OFFLINE as unknown as Awaited<ReturnType<typeof apiClient.patch>>;
        }
        throw err;
      }
    },
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useStartJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      try {
        return await apiClient.patch(`/jobs/${jobId}/start`);
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueueAction('start', jobId);
          toastQueuedOffline();
          return QUEUED_OFFLINE as unknown as Awaited<ReturnType<typeof apiClient.patch>>;
        }
        throw err;
      }
    },
    onSuccess: (_, jobId) => qc.invalidateQueries({ queryKey: ['job', jobId] }),
  });
}

export function useCompleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      completion_photos,
      completion_videos,
      completion_notes,
    }: {
      jobId: string;
      completion_photos?: string[];
      completion_videos?: string[];
      completion_notes?: string;
    }) => {
      // Upload ảnh/video TRƯỚC: bước này cần mạng — nếu upload lỗi mạng thì
      // ném lỗi như cũ (hàng đợi offline chỉ mang payload đã có URL sẵn).
      const [photos, videos] = await Promise.all([
        uploadFiles(completion_photos),
        uploadFiles(completion_videos),
      ]);
      const payload = {
        completion_photos: photos,
        completion_videos: videos,
        completion_notes,
      };
      try {
        return await apiClient.patch(`/jobs/${jobId}/complete`, payload);
      } catch (err) {
        // Feature 16: payload đã sẵn sàng (ảnh đã upload) mà PATCH mất mạng
        // → xếp hàng offline, flush sẽ gửi lại nguyên payload này.
        if (isNetworkError(err)) {
          await enqueueAction('complete', jobId, payload as Record<string, unknown>);
          toastQueuedOffline();
          return QUEUED_OFFLINE as unknown as Awaited<ReturnType<typeof apiClient.patch>>;
        }
        throw err;
      }
    },
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      if ((res as unknown as { queued_offline?: boolean })?.queued_offline) return;
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

// ─── Phân tích ảnh sự cố bằng AI Vision (Roadmap Phase 2 — Feature 17) ─────

export interface IssuePhotoAnalysis {
  available: boolean;
  detected_issue?: string;
  suggested_service_slug?: string | null;
  description_draft?: string;
  price_min?: number;
  price_max?: number;
  confidence?: number;
}

export function useAnalyzeIssuePhoto() {
  return useMutation({
    mutationFn: (dto: { image_base64: string; mime_type: string }) =>
      apiClient.post('/ai/analyze-photo', dto),
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

// ─── Monthly Contracts (Feature 08 — Hợp đồng giúp việc theo tháng) ─────────

export type MonthlyContractStatus = 'pending' | 'active' | 'rejected' | 'cancelled' | 'ended';
export type AttendanceStatus = 'checked_in' | 'confirmed' | 'absent' | 'leave';

export interface MonthlyContractItem {
  _id: string;
  customer_id: string | { _id: string; full_name?: string; avatar?: string; phone?: string };
  helper_id: string | { _id: string; full_name?: string; avatar?: string; phone?: string };
  service_id?: string | { _id: string; name?: string; icon?: string };
  title: string;
  monthly_salary: number;
  platform_fee_percent: number;
  address: {
    full_address: string;
    ward?: string;
    district: string;
    city: string;
    location: { type: 'Point'; coordinates: [number, number] };
    notes?: string;
  };
  schedule: { days_of_week: number[]; time_start: string; time_end: string };
  start_date: string;
  end_date?: string;
  status: MonthlyContractStatus;
  responded_at?: string;
  ended_at?: string;
  end_reason?: string;
  created_at: string;
}

export interface AttendanceRecordItem {
  _id: string;
  contract_id: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkin_at?: string;
  confirmed_at?: string;
  note?: string;
}

export interface LeaveRequestItem {
  _id: string;
  contract_id: string;
  helper_id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  responded_at?: string;
  created_at: string;
}

export interface SettlementSummary {
  contract_id: string;
  month: string;
  scheduled_days: number;
  confirmed_days: number;
  leave_days: number;
  absent_days: number;
  gross_amount: number;
  platform_fee: number;
  helper_receives: number;
  status: 'settled' | 'preview';
  settled_at?: string;
  settlement_id?: string;
}

const monthlyErr = (err: any, fallback: string) => {
  const msg = err?.response?.data?.message ?? fallback;
  Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : fallback });
};

export function useMonthlyContracts(as: 'customer' | 'helper') {
  return useQuery({
    queryKey: ['monthly-contracts', as],
    queryFn: async () => {
      const { data } = await apiClient.get('/monthly-contracts', { params: { as } });
      return data.data as MonthlyContractItem[];
    },
  });
}

export function useMonthlyContract(id?: string) {
  return useQuery({
    queryKey: ['monthly-contracts', 'detail', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/monthly-contracts/${id}`);
      return data.data as MonthlyContractItem;
    },
    enabled: !!id,
  });
}

export function useCreateMonthlyContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => apiClient.post('/monthly-contracts', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthly-contracts'] });
      Toast.show({
        type: 'success',
        text1: 'Đã gửi đề nghị hợp đồng 📅',
        text2: 'Thợ sẽ nhận được thông báo và phản hồi sớm',
      });
    },
    onError: (err: any) => monthlyErr(err, 'Tạo hợp đồng thất bại'),
  });
}

function useMonthlyContractAction(successText: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, path, body }: { id: string; path: string; body?: any }) =>
      apiClient.patch(`/monthly-contracts/${id}/${path}`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthly-contracts'] });
      Toast.show({ type: 'success', text1: successText });
    },
    onError: (err: any) => monthlyErr(err, 'Thao tác thất bại'),
  });
}

export function useRespondMonthlyContract() {
  return useMonthlyContractAction('Đã phản hồi hợp đồng');
}

export function useCancelMonthlyContract() {
  return useMonthlyContractAction('Đã hủy hợp đồng');
}

export function useEndMonthlyContract() {
  return useMonthlyContractAction('Đã kết thúc hợp đồng');
}

export function useMonthlyAttendance(id?: string, month?: string) {
  return useQuery({
    queryKey: ['monthly-contracts', id, 'attendance', month],
    queryFn: async () => {
      const { data } = await apiClient.get(`/monthly-contracts/${id}/attendance`, {
        params: { month },
      });
      return data.data as {
        contract_id: string;
        month: string;
        scheduled_dates: string[];
        records: AttendanceRecordItem[];
        today: string;
      };
    },
    enabled: !!id,
  });
}

export function useCheckinMonthly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/monthly-contracts/${id}/attendance/checkin`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['monthly-contracts', id] });
      qc.invalidateQueries({ queryKey: ['monthly-contracts'] });
      Toast.show({ type: 'success', text1: 'Đã điểm danh hôm nay 🟢' });
    },
    onError: (err: any) => monthlyErr(err, 'Điểm danh thất bại'),
  });
}

export function useConfirmAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, approve }: { id: string; date: string; approve: boolean }) =>
      apiClient.patch(`/monthly-contracts/${id}/attendance/${date}/confirm`, { approve }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['monthly-contracts', vars.id] });
      Toast.show({ type: 'success', text1: 'Đã cập nhật điểm danh' });
    },
    onError: (err: any) => monthlyErr(err, 'Cập nhật điểm danh thất bại'),
  });
}

export function useMonthlyLeaveRequests(id?: string) {
  return useQuery({
    queryKey: ['monthly-contracts', id, 'leave-requests'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/monthly-contracts/${id}/leave-requests`);
      return data.data as LeaveRequestItem[];
    },
    enabled: !!id,
  });
}

export function useRequestLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, reason }: { id: string; date: string; reason: string }) =>
      apiClient.post(`/monthly-contracts/${id}/leave-requests`, { date, reason }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['monthly-contracts', vars.id, 'leave-requests'] });
      Toast.show({ type: 'success', text1: 'Đã gửi đơn xin nghỉ 🌴' });
    },
    onError: (err: any) => monthlyErr(err, 'Gửi đơn xin nghỉ thất bại'),
  });
}

export function useRespondLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, leaveId, approve }: { id: string; leaveId: string; approve: boolean }) =>
      apiClient.patch(`/monthly-contracts/${id}/leave-requests/${leaveId}/respond`, { approve }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['monthly-contracts', vars.id, 'leave-requests'] });
      qc.invalidateQueries({ queryKey: ['monthly-contracts', vars.id, 'attendance'] });
      Toast.show({ type: 'success', text1: 'Đã xử lý đơn xin nghỉ' });
    },
    onError: (err: any) => monthlyErr(err, 'Xử lý đơn xin nghỉ thất bại'),
  });
}

export function useMonthlySettlement(id?: string, month?: string) {
  return useQuery({
    queryKey: ['monthly-contracts', id, 'settlement', month],
    queryFn: async () => {
      const { data } = await apiClient.get(`/monthly-contracts/${id}/settlement`, {
        params: { month },
      });
      return data.data as SettlementSummary;
    },
    enabled: !!id,
  });
}

export function useSettleMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, month }: { id: string; month: string }) =>
      apiClient.post(`/monthly-contracts/${id}/settlement/settle`, { month }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['monthly-contracts', vars.id, 'settlement'] });
      qc.invalidateQueries({ queryKey: ['monthly-contracts'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      Toast.show({
        type: 'success',
        text1: 'Đã chốt lương tháng 💰',
        text2: 'Tiền đã được cộng vào ví của thợ',
      });
    },
    onError: (err: any) => monthlyErr(err, 'Chốt lương thất bại'),
  });
}

// ─── Insurance Claims (Feature 10 — Yêu cầu bồi thường bảo hiểm) ─────────────

export type InsuranceClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'paid'
  | 'rejected';

export interface InsuranceClaimItem {
  _id: string;
  job_id: string | { _id: string; title?: string; status?: string };
  customer_id: string;
  helper_id?: string;
  description: string;
  photos: string[];
  requested_amount?: number;
  approved_amount: number;
  status: InsuranceClaimStatus;
  reject_reason?: string;
  payout_transaction_id?: string;
  timeline: {
    status: InsuranceClaimStatus;
    note?: string;
    actor_id: string;
    actor_role: string;
    at: string;
  }[];
  created_at: string;
  updated_at: string;
}

export function useCreateClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: {
      job_id: string;
      description: string;
      photos?: string[];
      requested_amount?: number;
    }) => {
      const uploaded = await uploadFiles(dto.photos);
      return apiClient.post('/claims', { ...dto, photos: uploaded });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['claims'] });
      qc.invalidateQueries({ queryKey: ['claim-for-job', vars.job_id] });
      qc.invalidateQueries({ queryKey: ['job', vars.job_id] });
      Toast.show({
        type: 'success',
        text1: 'Đã gửi yêu cầu bồi thường 🛡',
        text2: 'Đội ngũ Green House sẽ xem xét và phản hồi sớm nhất',
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Gửi yêu cầu thất bại';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

export function useMyClaims() {
  return useQuery({
    queryKey: ['claims', 'mine'],
    queryFn: async () => {
      const { data } = await apiClient.get('/claims/mine');
      return data.data as InsuranceClaimItem[];
    },
  });
}

export function useClaimForJob(jobId?: string) {
  return useQuery({
    queryKey: ['claim-for-job', jobId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/claims/job/${jobId}`);
      return (data.data ?? null) as InsuranceClaimItem | null;
    },
    enabled: !!jobId,
    retry: false,
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

// ─── Voice Calls (Roadmap Phase 1 — Gọi thoại che số) ───────────────────────

export interface CallConfig {
  enabled: boolean;
  provider: string | null;
  message?: string;
}

export interface CallSessionInit {
  session_id: string;
  provider: string;
  token: string;
  token_expires_at: string;
  room_id: string;
  partner_id: string;
  my_user_id: string;
}

export function useCallConfig() {
  return useQuery({
    queryKey: ['call-config'],
    queryFn: async () => {
      const { data } = await apiClient.get('/calls/config');
      return data.data as CallConfig;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useInitiateCall() {
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await apiClient.post('/calls/token', { job_id: jobId });
      return data.data as CallSessionInit;
    },
  });
}

export function useEndCall() {
  return useMutation({
    mutationFn: ({ sessionId, reason }: { sessionId: string; reason?: string }) =>
      apiClient.post(`/calls/sessions/${sessionId}/end`, { reason }),
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

// ─── Loyalty (Feature 12 — Điểm thành viên & hạng khách) ─────────────────────

export interface LoyaltyAccount {
  user_id: string;
  points_balance: number;
  lifetime_points: number;
  tier: 'regular' | 'silver' | 'gold';
  tier_label: string;
  next_tier_at: number | null;
  points_to_next_tier: number;
  redemption_cap_percent: number;
  earn_vnd_per_point: number;
  point_value_vnd: number;
  min_redeem_points: number;
}

export interface LoyaltyTransactionItem {
  _id: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  job_id?: string;
  balance_after: number;
  note?: string;
  created_at: string;
}

export function useLoyaltyAccount() {
  return useQuery({
    queryKey: ['loyalty', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/loyalty/me');
      return data.data as LoyaltyAccount;
    },
  });
}

export function useLoyaltyHistory(page = 1, limit = 30) {
  return useQuery({
    queryKey: ['loyalty', 'history', page, limit],
    queryFn: async () => {
      const { data } = await apiClient.get('/loyalty/me/history', { params: { page, limit } });
      return data.data as {
        transactions: LoyaltyTransactionItem[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
      };
    },
  });
}

export function useApplyLoyaltyPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, points }: { jobId: string; points: number }) =>
      apiClient.post('/loyalty/apply', { job_id: jobId, points }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['loyalty'] });
      Toast.show({ type: 'success', text1: 'Đã áp dụng điểm thành viên ⭐' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Không áp dụng được điểm';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

export function useRemoveLoyaltyPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.delete(`/loyalty/apply/${jobId}`),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['loyalty'] });
      Toast.show({ type: 'success', text1: 'Đã gỡ điểm khỏi đơn' });
    },
  });
}


// ─── Helper Availability (Feature 13 — Lịch làm việc của thợ) ────────────────

export interface HelperAvailability {
  enabled: boolean;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  blocked_dates: string[];
}

export function useMyAvailability() {
  return useQuery({
    queryKey: ['helpers', 'me', 'availability'],
    queryFn: async () => {
      const { data } = await apiClient.get('/helpers/me/availability');
      return data.data as HelperAvailability;
    },
  });
}

export function useUpdateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: HelperAvailability) => apiClient.patch('/helpers/me/availability', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['helpers', 'me', 'availability'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      Toast.show({ type: 'success', text1: 'Đã lưu lịch làm việc 🗓️' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Không lưu được lịch làm việc';
      Toast.show({
        type: 'error',
        text1: Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra',
      });
    },
  });
}


// ─── Earnings Report (Feature 14 — Báo cáo thu nhập thợ) ─────────────────────

export interface EarningsReport {
  week: {
    days: { date: string; amount: number }[];
    total: number;
    prev_week_total: number;
    change_percent: number | null;
  };
  month: {
    total: number;
    jobs_earning_count: number;
    prev_month_total: number;
    change_percent: number | null;
    by_week: { week: number; amount: number }[];
  };
  goal: {
    monthly_goal: number;
    earned_this_month: number;
    progress_percent: number;
  };
}

export function useEarningsReport() {
  return useQuery({
    queryKey: ['payments', 'earnings-report'],
    queryFn: async () => {
      const { data } = await apiClient.get('/payments/me/earnings-report');
      return data.data as EarningsReport;
    },
  });
}

export function useSetIncomeGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => apiClient.patch('/helpers/me/income-goal', { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', 'earnings-report'] });
      qc.invalidateQueries({ queryKey: ['helper', 'profile'] });
      Toast.show({ type: 'success', text1: 'Đã đặt mục tiêu thu nhập 🎯' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Không đặt được mục tiêu';
      Toast.show({ type: 'error', text1: typeof msg === 'string' ? msg : 'Đã có lỗi xảy ra' });
    },
  });
}

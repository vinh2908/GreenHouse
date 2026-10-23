'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Users ────────────────────────────────────────────────────────────────────

export function useAdminUsers(params: { search?: string; status?: string; page?: number }) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/users', { params });
      return data.data;
    },
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/admin/users/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiClient.patch(`/admin/users/${id}/suspend`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user'] });
    },
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/users/${id}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user'] });
    },
  });
}

// ─── Helpers / KYC ────────────────────────────────────────────────────────────

export function useAdminHelpers(params: { search?: string; status?: string; page?: number }) {
  return useQuery({
    queryKey: ['admin', 'helpers', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/helpers', { params });
      return data.data;
    },
  });
}

export function usePendingKyc(params: { page?: number }) {
  return useQuery({
    queryKey: ['admin', 'helpers', 'kyc', 'pending', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/helpers/kyc/pending', { params });
      return data.data;
    },
  });
}

export function useApproveKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.patch(`/admin/helpers/${userId}/kyc/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'user'] });
      qc.invalidateQueries({ queryKey: ['admin', 'helpers'] });
    },
  });
}

export function useRejectKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      apiClient.patch(`/admin/helpers/${userId}/kyc/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'user'] });
      qc.invalidateQueries({ queryKey: ['admin', 'helpers'] });
    },
  });
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export function useAdminJobs(params: { status?: string; search?: string; page?: number }) {
  return useQuery({
    queryKey: ['admin', 'jobs', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/jobs', { params });
      return data.data;
    },
  });
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export function useAdminWithdrawals(params: { status?: string; page?: number }) {
  return useQuery({
    queryKey: ['admin', 'withdrawals', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/payments/admin/withdrawals', { params });
      return data.data;
    },
  });
}

export function useProcessWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      admin_note,
    }: {
      id: string;
      action: 'approve' | 'reject';
      admin_note?: string;
    }) => apiClient.patch(`/payments/admin/withdrawals/${id}`, { action, admin_note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'withdrawals'] }),
  });
}

export function useAdminTransactions(params: { type?: string; page?: number }) {
  return useQuery({
    queryKey: ['admin', 'transactions', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/payments/admin/transactions', { params });
      return data.data;
    },
  });
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export function useAdminReviews(params: {
  min_rating?: number;
  max_rating?: number;
  page?: number;
}) {
  return useQuery({
    queryKey: ['admin', 'reviews', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/reviews/admin/all', { params });
      return data.data;
    },
  });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export function useAnalyticsSummary() {
  return useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: async () => {
      const { data } = await apiClient.get('/analytics/summary');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useJobsPerDay(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'jobs-per-day', days],
    queryFn: async () => {
      const { data } = await apiClient.get('/analytics/jobs-per-day', { params: { days } });
      return data.data as { date: string; count: number }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useJobsByStatus() {
  return useQuery({
    queryKey: ['analytics', 'jobs-by-status'],
    queryFn: async () => {
      const { data } = await apiClient.get('/analytics/jobs-by-status');
      return data.data as { status: string; count: number }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRevenuePerMonth(months = 6) {
  return useQuery({
    queryKey: ['analytics', 'revenue-per-month', months],
    queryFn: async () => {
      const { data } = await apiClient.get('/analytics/revenue-per-month', {
        params: { months },
      });
      return data.data as { month: string; total: number; count: number }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopHelpers() {
  return useQuery({
    queryKey: ['analytics', 'top-helpers'],
    queryFn: async () => {
      const { data } = await apiClient.get('/analytics/top-helpers');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export function useDashboardStats() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/dashboard');
      return data.data;
    },
    staleTime: 60 * 1000,
  });
}

// ─── Job detail / admin actions ────────────────────────────────────────────────

export function useAdminJob(id?: string) {
  return useQuery({
    queryKey: ['admin', 'job', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/admin/jobs/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useAdminCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.patch(`/jobs/${id}/cancel`, { reason }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'job', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
  });
}

export function useAdminResolveDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      refund_amount,
      admin_note,
    }: {
      id: string;
      action: 'refund_full' | 'refund_partial' | 'release_to_helper';
      refund_amount?: number;
      admin_note: string;
    }) => apiClient.patch(`/jobs/${id}/resolve-dispute`, { action, refund_amount, admin_note }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'job', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      qc.invalidateQueries({ queryKey: ['admin', 'transactions'] });
    },
  });
}

// ─── Services catalogue ─────────────────────────────────────────────────────────

export interface AdminService {
  _id: string;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'inactive';
  price_range_min: number;
  price_range_max: number;
  base_price_min?: number;
  base_price_max?: number;
  platform_fee_percent: number;
  pricing_model?: 'quote' | 'fixed'; // Feature 7: báo giá | giá cam kết
  fixed_price?: number;
  category_id: { _id: string; name: string } | null;
}

export function useAdminServices() {
  return useQuery({
    queryKey: ['admin', 'services'],
    queryFn: async () => {
      const { data } = await apiClient.get('/services', { params: { include_inactive: true } });
      return data.data as AdminService[];
    },
  });
}

export function useServiceCategories() {
  return useQuery({
    queryKey: ['admin', 'service-categories'],
    queryFn: async () => {
      const { data } = await apiClient.get('/services/categories');
      return data.data as { _id: string; name: string }[];
    },
  });
}

export function useCreateServiceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name: string; slug: string }) =>
      apiClient.post('/services/categories', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'service-categories'] }),
  });
}

export function useSaveService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...dto
    }: Partial<Omit<AdminService, 'category_id'>> & { id?: string; category_id?: string }) =>
      id ? apiClient.put(`/services/${id}`, dto) : apiClient.post('/services', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'services'] }),
  });
}

export function useToggleService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      apiClient.patch(`/services/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'services'] }),
  });
}

// ─── Broadcast ──────────────────────────────────────────────────────────────────

export function useBroadcast() {
  return useMutation({
    mutationFn: async (dto: { title: string; body: string }) => {
      const { data } = await apiClient.post('/admin/notifications/broadcast', dto);
      return data.data as { sent: number };
    },
  });
}

// ─── Vouchers (Roadmap Phase 1 — Mã giảm giá) ─────────────────────────────────

export interface AdminVoucher {
  _id: string;
  code: string;
  description?: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_discount_amount?: number;
  min_order_amount: number;
  total_usage_limit?: number;
  per_user_limit: number;
  used_count: number;
  is_active: boolean;
  valid_from?: string;
  valid_to?: string;
  created_at: string;
}

export function useAdminVouchers(params: { search?: string; page?: number }) {
  return useQuery({
    queryKey: ['admin', 'vouchers', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/vouchers', { params });
      return data.data as { vouchers: AdminVoucher[]; total: number; total_pages: number };
    },
  });
}

export function useSaveVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: Record<string, unknown> & { id?: string }) =>
      id ? apiClient.patch(`/admin/vouchers/${id}`, dto) : apiClient.post('/admin/vouchers', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] }),
  });
}

export function useToggleVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/vouchers/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] }),
  });
}

// ─── Insurance Claims (Feature 10 — Bồi thường bảo hiểm) ──────────────────────

export type AdminClaimStatus = 'submitted' | 'under_review' | 'approved' | 'paid' | 'rejected';

export interface AdminClaim {
  _id: string;
  job_id:
    | string
    | {
        _id: string;
        title?: string;
        status?: string;
        description?: string;
        address?: any;
        created_at?: string;
      }
    | null;
  customer_id: string | { _id: string; full_name?: string; avatar?: string; phone?: string } | null;
  helper_id?: string | { _id: string; full_name?: string; phone?: string } | null;
  description: string;
  photos: string[];
  requested_amount?: number;
  approved_amount: number;
  status: AdminClaimStatus;
  reject_reason?: string;
  payout_transaction_id?: string;
  timeline: {
    status: AdminClaimStatus;
    note?: string;
    actor_id: string;
    actor_role: string;
    at: string;
  }[];
  created_at: string;
  updated_at: string;
}

export function useAdminClaims(params: { status?: string; page?: number }) {
  return useQuery({
    queryKey: ['admin', 'claims', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/claims', { params });
      return data.data as { claims: AdminClaim[]; total: number; total_pages: number };
    },
  });
}

export function useAdminClaim(id?: string | null) {
  return useQuery({
    queryKey: ['admin', 'claim', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/admin/claims/${id}`);
      return data.data as AdminClaim;
    },
    enabled: !!id,
  });
}

export function useReviewClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...dto
    }: {
      id: string;
      action: 'approve' | 'reject' | 'start_review';
      approved_amount?: number;
      note?: string;
    }) => apiClient.patch(`/admin/claims/${id}/review`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'claims'] });
      qc.invalidateQueries({ queryKey: ['admin', 'claim'] });
    },
  });
}

// ─── Support live chat (Feature 18 — Hỗ trợ trực tuyến) ───────────────────────

export interface AdminSupportConversation {
  _id: string;
  user_id: string | { _id: string; full_name?: string; phone?: string; avatar?: string } | null;
  status: 'open' | 'closed';
  last_message?: string;
  last_message_at?: string;
  unread_for_admin: number;
  unread_for_user: number;
  created_at: string;
  updated_at: string;
}

export interface AdminSupportMessage {
  _id: string;
  conversation_id: string;
  sender_id: string | { _id: string; full_name?: string; avatar?: string } | null;
  sender_role: 'user' | 'admin';
  content: string;
  type: string;
  created_at: string;
}

export function useSupportConversations(status: string = 'all') {
  return useQuery({
    queryKey: ['admin', 'support', 'conversations', status],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/support/conversations', {
        params: { status },
      });
      return data.data as AdminSupportConversation[];
    },
    refetchInterval: 5000,
  });
}

export function useSupportThread(id?: string | null) {
  return useQuery({
    queryKey: ['admin', 'support', 'thread', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/admin/support/conversations/${id}/messages`, {
        params: { page: 1, limit: 50 },
      });
      return data.data as AdminSupportMessage[];
    },
    enabled: !!id,
    refetchInterval: 5000,
  });
}

export function useAdminSupportReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiClient.post(`/admin/support/conversations/${id}/messages`, { content }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'support', 'thread', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'support', 'conversations'] });
    },
  });
}

export function useAdminSupportClose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/support/conversations/${id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'support', 'conversations'] });
      qc.invalidateQueries({ queryKey: ['admin', 'support', 'thread'] });
    },
  });
}

export function useAdminSupportRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/support/conversations/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'support', 'conversations'] }),
  });
}

// ─── SOS Backup oversight & Helper penalty log (Backlog Batch 1 API + Batch 2 UI) ─

export interface AdminSosUserRef {
  _id: string;
  full_name: string;
  phone: string;
}

/** Yêu cầu SOS bị gắn cờ admin_attention=true (GET /admin/sos-backup/flagged) */
export interface AdminSosRequest {
  _id: string;
  job_id:
    | {
        _id: string;
        title?: string;
        status?: string;
        payment_status?: string;
        payment_method?: string;
      }
    | string
    | null;
  customer_id: AdminSosUserRef | string | null;
  original_helper_id: AdminSosUserRef | string | null;
  replacement_helper_id?: AdminSosUserRef | string | null;
  /** Snapshot tiêu đề đơn tại thời điểm thợ gửi SOS */
  job_title: string;
  service_name?: string;
  district?: string;
  city?: string;
  /** Mã lý do (SosBackupReason) */
  reason: string;
  reason_note?: string;
  /** Trạng thái vòng đời SOS (SosBackupStatus) */
  status: string;
  customer_decision?: string;
  decided_by?: string;
  admin_attention: boolean;
  admin_note?: string;
  /** Số tiền đã hoàn vào ví khách khi hủy theo chính sách SOS */
  refund_amount: number;
  photo_urls?: string[];
  created_at: string;
  updated_at: string;
}

export function useFlaggedSosRequests(params: { page?: number }) {
  return useQuery({
    queryKey: ['admin', 'sos-backup', 'flagged', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/sos-backup/flagged', { params });
      return data.data as {
        requests: AdminSosRequest[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
      };
    },
  });
}

/** 1 dòng sổ phạt hủy đơn của thợ (GET /admin/helper-penalty-events) */
export interface AdminPenaltyEvent {
  _id: string;
  helper_id: AdminSosUserRef | string | null;
  job_id: { _id: string; title?: string; status?: string } | string | null;
  source: 'job_cancel' | 'sos_initiation';
  /** Tổng số lần hủy trong cửa sổ 7 ngày ngay sau lần hủy này */
  cancellations_in_window: number;
  /** Số lần vượt ngưỡng tại thời điểm ghi */
  excess_count: number;
  /** Điểm bị trừ bởi chính lần hủy này */
  points_deducted: number;
  /** Điểm hiệu suất tổng sau khi áp phạt (đối soát) */
  performance_score_after: number;
  status: 'active' | 'waived';
  waived_by?: string;
  waived_at?: string;
  waive_reason?: string;
  created_at: string;
}

export function useHelperPenaltyEvents(params: {
  helper_id?: string;
  status?: string;
  page?: number;
}) {
  return useQuery({
    queryKey: ['admin', 'penalty-events', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/helper-penalty-events', { params });
      return data.data as {
        events: AdminPenaltyEvent[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
      };
    },
  });
}

export interface WaivePenaltyResult {
  event: AdminPenaltyEvent;
  helper_score: { total: number; penaltyPoints?: number } | null;
  already_waived: boolean;
}

export function useWaivePenaltyEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await apiClient.post(`/admin/helper-penalty-events/${id}/waive`, {
        reason,
      });
      return data.data as WaivePenaltyResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'penalty-events'] });
      // Điểm thợ đã được tính lại phía server — làm mới luôn các list thợ liên quan.
      qc.invalidateQueries({ queryKey: ['admin', 'helpers'] });
    },
  });
}

// ─── Monthly Contracts Management ─────────────────────────────────────────────

export interface AdminMonthlyContract {
  _id: string;
  customer_id?: { _id: string; full_name?: string; phone?: string; avatar?: string };
  helper_id?: { _id: string; full_name?: string; phone?: string; avatar?: string };
  title: string;
  status: string;
  monthly_amount: number;
  start_date: string;
  end_date?: string;
  time_start?: string;
  time_end?: string;
  created_at: string;
}

export function useAdminMonthlyContracts(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['admin', 'monthly-contracts', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/monthly-contracts/admin/all', { params });
      return data.data as {
        contracts: AdminMonthlyContract[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
      };
    },
  });
}

// ─── Manual Job Interventions ──────────────────────────────────────────────────

export function useAdminUpdateJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      const { data } = await apiClient.patch(`/admin/jobs/${id}/status`, { status, note });
      return data.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'job', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
  });
}

export function useAdminDirectRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, reason }: { id: string; amount: number; reason: string }) => {
      const { data } = await apiClient.post(`/admin/jobs/${id}/refund`, { amount, reason });
      return data.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'job', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
  });
}

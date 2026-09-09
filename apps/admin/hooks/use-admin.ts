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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/users/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
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
    staleTime: 5 * 60 * 1000, // 5 min
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
    staleTime: 60 * 1000, // 1 min
  });
}

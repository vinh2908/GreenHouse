// hooks/use-socket.ts — React hooks tích hợp Socket.IO vào components
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import { useAuthStore } from '@/stores/auth.store';
import Toast from 'react-native-toast-message';

// ─── Connect on auth ─────────────────────────────────────────────────────────

export function useSocketConnection() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      socketService.connect();
    } else {
      socketService.disconnect();
    }
    return () => {
      // Don't disconnect on unmount — keep connection alive
    };
  }, [isAuthenticated]);
}

// ─── Job status updates ──────────────────────────────────────────────────────

export function useJobSocketUpdates(jobId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!jobId) return;
    socketService.joinJob(jobId);

    const unsub1 = socketService.on<{ job_id: string; status: string }>(
      SOCKET_EVENTS.JOB_STATUS_CHANGED,
      ({ job_id, status }) => {
        if (job_id !== jobId) return;
        qc.invalidateQueries({ queryKey: ['job', jobId] });
        qc.invalidateQueries({ queryKey: ['jobs'] });

        const labels: Record<string, string> = {
          helper_on_the_way: '🚗 Helper đang trên đường đến',
          helper_arrived: '📍 Helper đã đến nơi!',
          in_progress: '▶️ Công việc đã bắt đầu',
          pending_review: '⏳ Helper đã hoàn thành, vui lòng nghiệm thu',
          completed: '✅ Công việc hoàn thành!',
          cancelled: '❌ Đơn đã bị hủy',
        };
        if (labels[status]) {
          Toast.show({ type: 'info', text1: labels[status], visibilityTime: 4000 });
        }
      },
    );

    const unsub2 = socketService.on<{ quote_id: string }>(
      SOCKET_EVENTS.QUOTE_RECEIVED,
      () => {
        qc.invalidateQueries({ queryKey: ['job', jobId, 'quotes'] });
        Toast.show({ type: 'success', text1: '💰 Có báo giá mới!' });
      },
    );

    return () => {
      unsub1();
      unsub2();
      socketService.leaveJob(jobId);
    };
  }, [jobId, qc]);
}

// ─── Chat messages ───────────────────────────────────────────────────────────

export function useChatSocket(conversationId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;
    socketService.joinConversation(conversationId);

    const unsub = socketService.on<{ message: unknown; conversation_id: string }>(
      SOCKET_EVENTS.CHAT_NEW_MESSAGE,
      (data) => {
        const cId = data?.conversation_id;
        if (!cId || cId === conversationId) {
          qc.invalidateQueries({ queryKey: ['messages', conversationId] });
          qc.invalidateQueries({ queryKey: ['conversations'] });
        }
      },
    );

    return () => {
      unsub();
    };
  }, [conversationId, qc]);
}

// ─── Notification sound/badge ────────────────────────────────────────────────

export function useNotificationSocket() {
  const qc = useQueryClient();

  useEffect(() => {
    const unsub = socketService.on(SOCKET_EVENTS.NOTIFICATION_NEW, () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
    });
    return unsub;
  }, [qc]);
}

// ─── Helper location (for customers) ────────────────────────────────────────

export function useHelperLocation(jobId?: string) {
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const unsub = socketService.on<{ helper_id: string; location: { lat: number; lng: number } }>(
      SOCKET_EVENTS.HELPER_LOCATION_UPDATE,
      ({ location }) => {
        locationRef.current = location;
      },
    );
    return unsub;
  }, [jobId]);

  return locationRef;
}

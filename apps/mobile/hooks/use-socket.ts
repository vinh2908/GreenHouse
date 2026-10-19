// hooks/use-socket.ts — React hooks tích hợp Socket.IO vào components
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import { useAuthStore } from '@/stores/auth.store';
import Toast from 'react-native-toast-message';

// ─── Connect on auth ─────────────────────────────────────────────────────────

export function useSocketConnection() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const qc = useQueryClient();

  useEffect(() => {
    if (isAuthenticated) {
      socketService.connect();

      // Lắng nghe toàn cục tin nhắn chat mới để hiển thị popup Toast khi không ở trong phòng chat đó
      const unsubChat = socketService.on<{
        conversation_id?: string;
        message?: {
          sender_id?: { _id?: string; full_name?: string } | string;
          content?: string;
          type?: string;
        };
      }>(SOCKET_EVENTS.CHAT_NEW_MESSAGE, data => {
        const currentUserId = useAuthStore.getState().user?._id;
        const senderObj = data?.message?.sender_id;
        const senderId = typeof senderObj === 'object' && senderObj ? senderObj._id : senderObj;

        // Bỏ qua nếu tin nhắn do chính mình gửi
        if (senderId && senderId === currentUserId) return;

        // Bỏ qua nếu đang trực tiếp mở và xem cuộc trò chuyện này
        const activeChat = (globalThis as any).__activeConversationId;
        if (activeChat && activeChat === data?.conversation_id) return;

        const senderName =
          (typeof senderObj === 'object' && senderObj?.full_name ? senderObj.full_name : null) ||
          'Đối tác';
        const content =
          data?.message?.type === 'image'
            ? 'Đã gửi một hình ảnh 📷'
            : data?.message?.content || 'Bạn có tin nhắn mới';

        Toast.show({
          type: 'info',
          text1: `💬 ${senderName}`,
          text2: content,
          visibilityTime: 5000,
        });

        qc.invalidateQueries({ queryKey: ['messages'] });
        qc.invalidateQueries({ queryKey: ['conversations'] });
        qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
      });

      return () => {
        unsubChat();
      };
    } else {
      socketService.disconnect();
    }
  }, [isAuthenticated, qc]);
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

    const unsub2 = socketService.on<{ quote_id: string }>(SOCKET_EVENTS.QUOTE_RECEIVED, () => {
      qc.invalidateQueries({ queryKey: ['job', jobId, 'quotes'] });
      Toast.show({ type: 'success', text1: '💰 Có báo giá mới!' });
    });

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

    // Viewing the chat marks it read (also clears its "Tin nhắn mới" notification).
    const markRead = () => {
      socketService.markRead(conversationId);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    };
    markRead();

    const unsub = socketService.on<{ message: unknown; conversation_id: string }>(
      SOCKET_EVENTS.CHAT_NEW_MESSAGE,
      data => {
        const cId = data?.conversation_id;
        if (!cId || cId === conversationId) {
          qc.invalidateQueries({ queryKey: ['messages', conversationId] });
          qc.invalidateQueries({ queryKey: ['conversations'] });
          markRead();
        }
      },
    );

    return () => {
      unsub();
      socketService.leaveConversation(conversationId);
    };
  }, [conversationId, qc]);
}

// ─── Notification sound/badge ────────────────────────────────────────────────

export function useNotificationSocket() {
  const qc = useQueryClient();

  useEffect(() => {
    const unsub = socketService.on<{
      type?: string;
      title?: string;
      body?: string;
      data?: { is_sos?: boolean };
    }>(SOCKET_EVENTS.NOTIFICATION_NEW, n => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
      if (n?.title && !(n.type === 'new_job_nearby' && n.data?.is_sos)) {
        const isNewJob = n.type === 'new_job_nearby';
        const isAccepted = n.type === 'job_confirmed' || n.type === 'quote_accepted';
        const isNewQuote = n.type === 'new_quote_received';
        const isNewMsg = n.type === 'new_message';

        const title = isNewJob
          ? 'Có đơn mới gần bạn 🎉'
          : isAccepted
            ? 'Tin vui về đơn hàng 🎉'
            : isNewQuote
              ? 'Có báo giá mới 💬'
              : isNewMsg
                ? '💬 ' + (n.title || 'Tin nhắn mới')
                : n.title;
        const body = isNewJob
          ? `${n.body || 'Một khách hàng vừa đăng công việc phù hợp.'} Mở mục Công việc để xem.`
          : isAccepted && n.type === 'job_confirmed'
            ? 'Đã có thợ nhận đơn của bạn. Mở đơn hàng để xem thông tin và theo dõi.'
            : isAccepted && n.type === 'quote_accepted'
              ? 'Khách hàng đã chọn báo giá của bạn. Mở đơn để xem hợp đồng.'
              : isNewQuote
                ? `${n.body || 'Một thợ vừa gửi báo giá.'} Chạm vào thông báo để xem chi tiết.`
                : isNewMsg
                  ? n.body || 'Bạn có tin nhắn mới từ đối tác'
                  : n.body;

        Toast.show({
          type: isNewJob || isAccepted || isNewQuote ? 'success' : 'info',
          text1: title,
          text2: body,
          visibilityTime: isNewJob || isAccepted || isNewMsg ? 6000 : 4500,
        });
      }
    });
    return unsub;
  }, [qc]);
}

export function useHelperLocation(jobId?: string) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const unsub = socketService.on<{ helper_id: string; location: { lat: number; lng: number } }>(
      SOCKET_EVENTS.HELPER_LOCATION_UPDATE,
      ({ location: loc }) => {
        if (loc?.lat && loc?.lng) {
          setLocation(loc);
        }
      },
    );
    return unsub;
  }, [jobId]);

  return location;
}

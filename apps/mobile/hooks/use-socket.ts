// hooks/use-socket.ts — React hooks tích hợp Socket.IO vào components
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService, SOCKET_EVENTS } from '@/services/socket.service';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore } from '@/stores/settings.store';
import Toast from 'react-native-toast-message';
import { acceptTrackingEvent, GPS_MAX_AGE_MS, TrackingEvent } from '@/services/tracking';
import { formatNotificationTitle, formatNotificationBody } from '@/services/i18n';
import { resolveNotificationRoute } from '@/utils/notification-route';
import { setPendingToastRoute } from '@/services/toast-navigation';

// ─── Connect on auth ─────────────────────────────────────────────────────────

export function useSocketConnection() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const qc = useQueryClient();

  useEffect(() => {
    if (isAuthenticated) {
      socketService.connect();

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

        if (senderId && senderId === currentUserId) return;

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

      const unsubStatus = socketService.on<{ helper_id?: string; status?: string }>(
        SOCKET_EVENTS.HELPER_STATUS_CHANGED,
        data => {
          if (data?.status) {
            qc.setQueryData(['helper', 'profile'], (old: any) =>
              old ? { ...old, status: data.status } : old,
            );
          }
          qc.invalidateQueries({ queryKey: ['helper', 'profile'] });
        },
      );

      const unsubQuoteRejected = socketService.on<{
        job_id?: string;
        quote_id?: string;
        reason?: string;
      }>(SOCKET_EVENTS.QUOTE_REJECTED, data => {
        qc.invalidateQueries({ queryKey: ['jobs'] });
        qc.invalidateQueries({ queryKey: ['helper', 'dashboard'] });
        if (data?.job_id) {
          qc.invalidateQueries({ queryKey: ['job', data.job_id] });
        }
        const lang = useSettingsStore.getState().language || 'vi';
        Toast.show({
          type: 'info',
          text1: lang === 'en' ? 'Quote not selected' : 'Báo giá không được chọn',
          text2:
            data?.reason ||
            (lang === 'en'
              ? 'The customer has selected another quote for this job.'
              : 'Khách hàng đã chọn báo giá khác cho công việc này.'),
          visibilityTime: 5000,
        });
      });

      // B16: listener cho các socket event đang phát mà không ai nghe
      const lang = () => useSettingsStore.getState().language || 'vi';
      const unsubJobCreated = socketService.on<{ job_id?: string }>(
        SOCKET_EVENTS.JOB_CREATED,
        data => {
          qc.invalidateQueries({ queryKey: ['jobs', 'available'] });
          qc.invalidateQueries({ queryKey: ['jobs'] });
          if (data?.job_id) qc.invalidateQueries({ queryKey: ['job', data.job_id] });
        },
      );
      const unsubPrivateOffer = socketService.on<{ job_id?: string }>(
        SOCKET_EVENTS.JOB_PRIVATE_OFFER,
        data => {
          qc.invalidateQueries({ queryKey: ['jobs', 'available'] });
          qc.invalidateQueries({ queryKey: ['helper-jobs'] });
          if (data?.job_id) qc.invalidateQueries({ queryKey: ['job', data.job_id] });
          Toast.show({
            type: 'success',
            text1:
              lang() === 'en'
                ? 'A regular customer sent you a private job!'
                : 'Khách quen gửi việc riêng cho bạn!',
            visibilityTime: 6000,
          });
        },
      );
      const unsubTeamInvitation = socketService.on<{ job_id?: string; split_percent?: number }>(
        SOCKET_EVENTS.TEAM_INVITATION,
        data => {
          qc.invalidateQueries({ queryKey: ['team-invitations'] });
          if (data?.job_id) qc.invalidateQueries({ queryKey: ['job', data.job_id] });
          Toast.show({
            type: 'info',
            text1:
              lang() === 'en'
                ? 'You were invited to join a team job'
                : 'Bạn được mời tham gia đơn nhóm',
            text2:
              data?.split_percent != null
                ? lang() === 'en'
                  ? `Revenue share ${data.split_percent}%`
                  : `Tỉ lệ chia tiền công ${data.split_percent}%`
                : undefined,
            visibilityTime: 6000,
          });
        },
      );
      const unsubQuoteAccepted = socketService.on<{ job_id?: string; quote_id?: string }>(
        SOCKET_EVENTS.QUOTE_ACCEPTED,
        data => {
          qc.invalidateQueries({ queryKey: ['jobs'] });
          qc.invalidateQueries({ queryKey: ['helper-jobs'] });
          qc.invalidateQueries({ queryKey: ['helper', 'dashboard'] });
          if (data?.job_id) {
            qc.invalidateQueries({ queryKey: ['job', data.job_id] });
            qc.invalidateQueries({ queryKey: ['job', data.job_id, 'quotes'] });
          }
          Toast.show({
            type: 'success',
            text1:
              lang() === 'en'
                ? 'Your quote was accepted!'
                : 'Báo giá của bạn đã được chấp nhận!',
            visibilityTime: 5000,
          });
        },
      );
      const unsubTeamUpdated = socketService.on<{ job_id?: string }>(
        SOCKET_EVENTS.TEAM_UPDATED,
        data => {
          qc.invalidateQueries({ queryKey: ['jobs'] });
          qc.invalidateQueries({ queryKey: ['helper-jobs'] });
          qc.invalidateQueries({ queryKey: ['team-invitations'] });
          if (data?.job_id) qc.invalidateQueries({ queryKey: ['job', data.job_id] });
        },
      );
      const unsubDisputeUpdated = socketService.on<{ job_id?: string; case_id?: string }>(
        SOCKET_EVENTS.DISPUTE_UPDATED,
        data => {
          if (data?.job_id) {
            qc.invalidateQueries({ queryKey: ['dispute', data.job_id] });
            qc.invalidateQueries({ queryKey: ['job', data.job_id] });
          }
          qc.invalidateQueries({ queryKey: ['jobs'] });
          Toast.show({
            type: 'info',
            text1:
              lang() === 'en'
                ? 'A dispute case was updated'
                : 'Hồ sơ tranh chấp có cập nhật',
            visibilityTime: 5000,
          });
        },
      );

      return () => {
        unsubChat();
        unsubStatus();
        unsubQuoteRejected();
        unsubJobCreated();
        unsubPrivateOffer();
        unsubTeamInvitation();
        unsubQuoteAccepted();
        unsubTeamUpdated();
        unsubDisputeUpdated();
      };
    } else {
      socketService.disconnect();
    }
  }, [isAuthenticated, qc]);
}

// ─── Job status & Contract updates ───────────────────────────────────────────

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
        qc.invalidateQueries({ queryKey: ['job', jobId, 'contract'] });
        qc.invalidateQueries({ queryKey: ['jobs'] });

        const labels: Record<string, string> = {
          helper_on_the_way: '🚗 Helper đang trên đường đến',
          helper_arrived: '📍 Helper đã đến nơi!',
          in_progress: '▶️ Công việc đã bắt đầu',
          pending_review: '⏳ Helper đã hoàn thành, vui lòng nghiệm thu',
          completed: '✅ Công việc hoàn thành!',
          cancelled: '❌ Đơn đã bị hủy',
          disputed: '⚠️ Đơn hàng đã chuyển sang trạng thái Khiếu nại / Tranh chấp',
          refunded: '↩️ Đơn hàng đã được hoàn tiền',
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

    const unsub3 = socketService.on<{ job_id: string }>(SOCKET_EVENTS.CONTRACT_AMENDED, () => {
      qc.invalidateQueries({ queryKey: ['job', jobId, 'contract'] });
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      Toast.show({
        type: 'info',
        text1: '📋 Có đề xuất phát sinh vật tư / chi phí mới!',
        text2: 'Vui lòng kiểm tra mục Hợp đồng dịch vụ để duyệt.',
      });
    });

    const unsub4 = socketService.on<{ job_id: string; status: string }>(
      SOCKET_EVENTS.CONTRACT_AMENDMENT_ACCEPTED,
      data => {
        qc.invalidateQueries({ queryKey: ['job', jobId, 'contract'] });
        qc.invalidateQueries({ queryKey: ['job', jobId] });
        Toast.show({
          type: data?.status === 'accepted' ? 'success' : 'info',
          text1:
            data?.status === 'accepted'
              ? '✅ Khách hàng đã đồng ý chi phí phát sinh!'
              : 'ℹ️ Khách hàng đã từ chối khoản phát sinh',
        });
      },
    );

    const unsub5 = socketService.on<{ job_id?: string; quote_id?: string }>(
      SOCKET_EVENTS.QUOTE_REJECTED,
      data => {
        if (data?.job_id && data.job_id !== jobId) return;
        qc.invalidateQueries({ queryKey: ['job', jobId] });
        qc.invalidateQueries({ queryKey: ['job', jobId, 'quotes'] });
        qc.invalidateQueries({ queryKey: ['jobs'] });
      },
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
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

// ─── Monthly Contract socket updates (A85) ──────────────────────────────────
export function useMonthlyContractSocket(contractId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const handleUpdate = () => {
      qc.invalidateQueries({ queryKey: ['monthly-contracts'] });
      if (contractId) {
        qc.invalidateQueries({ queryKey: ['monthly-contract', contractId] });
      }
    };

    const unsub1 = socketService.on('contract:created', handleUpdate);
    const unsub2 = socketService.on('contract:checked_in', handleUpdate);
    const unsub3 = socketService.on('contract:ended', handleUpdate);
    const unsub4 = socketService.on('contract:settled', handleUpdate);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [contractId, qc]);
}

// ─── Support live chat (Feature 18) ───────────────────────────────────────────
// Admin trả lời qua REST; server emit 'support:message' tới room của user nên
// invalidate ngay, polling 4s trong useSupportMessages chỉ là lớp dự phòng.

export function useSupportSocket() {
  const qc = useQueryClient();

  useEffect(() => {
    const unsub = socketService.on<{ conversation_id?: string }>(
      SOCKET_EVENTS.SUPPORT_MESSAGE,
      data => {
        qc.invalidateQueries({ queryKey: ['support', 'mine'] });
        if (data?.conversation_id) {
          qc.invalidateQueries({ queryKey: ['support', 'messages', data.conversation_id] });
        } else {
          qc.invalidateQueries({ queryKey: ['support', 'messages'] });
        }
      },
    );
    return unsub;
  }, [qc]);
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
        const lang = useSettingsStore.getState().language || 'vi';
        const isNewJob = n.type === 'new_job_nearby';
        const isAccepted = n.type === 'job_confirmed' || n.type === 'quote_accepted';
        const isNewQuote = n.type === 'new_quote_received';
        const isNewMsg = n.type === 'new_message';

        const title = isNewJob
          ? lang === 'en'
            ? 'New job near you 🎉'
            : 'Có đơn mới gần bạn 🎉'
          : isAccepted
            ? lang === 'en'
              ? 'Great news about your order 🎉'
              : 'Tin vui về đơn hàng 🎉'
            : isNewQuote
              ? lang === 'en'
                ? 'New quote received 💬'
                : 'Có báo giá mới 💬'
              : isNewMsg
                ? '💬 ' +
                  (formatNotificationTitle(n.title, lang) ||
                    (lang === 'en' ? 'New message' : 'Tin nhắn mới'))
                : formatNotificationTitle(n.title, lang, n.type);
        const body = isNewJob
          ? lang === 'en'
            ? `${formatNotificationBody(n.body, lang) || 'A customer just posted a matching job.'} Open Jobs tab to view.`
            : `${n.body || 'Một khách hàng vừa đăng công việc phù hợp.'} Mở mục Công việc để xem.`
          : isAccepted && n.type === 'job_confirmed'
            ? lang === 'en'
              ? 'A helper has accepted your order. Open order to view details and track.'
              : 'Đã có thợ nhận đơn của bạn. Mở đơn hàng để xem thông tin và theo dõi.'
            : isAccepted && n.type === 'quote_accepted'
              ? lang === 'en'
                ? 'The customer has accepted your quote. Open order to view contract.'
                : 'Khách hàng đã chọn báo giá của bạn. Mở đơn để xem hợp đồng.'
              : isNewQuote
                ? lang === 'en'
                  ? `${formatNotificationBody(n.body, lang) || 'A helper just submitted a quote.'} Tap notification to view details.`
                  : `${n.body || 'Một thợ vừa gửi báo giá.'} Chạm vào thông báo để xem chi tiết.`
                : isNewMsg
                  ? lang === 'en'
                    ? formatNotificationBody(n.body, lang) || 'You have a new message from partner'
                    : n.body || 'Bạn có tin nhắn mới từ đối tác'
                  : formatNotificationBody(n.body, lang, n.type, n.data);

        // B10: Toast realtime bấm được — resolve route ngay lúc hiện Toast,
        // ToastCard sẽ điều hướng khi người dùng chạm vào thẻ.
        const authUser = useAuthStore.getState().user;
        const toastRoute = resolveNotificationRoute(
          { type: n.type, title: n.title, body: n.body, data: n.data as any },
          authUser?.active_role,
          (authUser as { roles?: string[] } | null)?.roles,
        );
        const toastTtl = isNewJob || isAccepted || isNewMsg ? 6000 : 4500;
        setPendingToastRoute(toastRoute, toastTtl);
        Toast.show({
          type: isNewJob || isAccepted || isNewQuote ? 'success' : 'info',
          text1: title,
          text2: body,
          visibilityTime: toastTtl,
        });
      }
    });
    return unsub;
  }, [qc]);
}

export function useHelperLocation(jobId?: string, helperId?: string) {
  const [sample, setSample] = useState<TrackingEvent | null>(null);

  useEffect(() => {
    setSample(null);
    if (!jobId) return;
    const unsub = socketService.on<TrackingEvent>(SOCKET_EVENTS.HELPER_LOCATION_UPDATE, event => {
      setSample(previous =>
        acceptTrackingEvent(event, jobId, helperId, previous?.location) ? event : previous,
      );
    });
    // Subscribe before joining: the server immediately replays the last valid GPS fix.
    socketService.joinJob(jobId);
    const timer = setInterval(
      () =>
        setSample(previous =>
          previous && Date.now() - previous.location.recorded_at > GPS_MAX_AGE_MS ? null : previous,
        ),
      5000,
    );
    return () => {
      unsub();
      clearInterval(timer);
      socketService.leaveJob(jobId);
    };
  }, [jobId, helperId]);

  return sample && sample.job_id === jobId ? sample.location : null;
}

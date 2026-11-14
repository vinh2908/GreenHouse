// hooks/use-push-notifications.ts — Nối OS push ở root app:
//  1. Khi user đăng nhập: đăng ký Expo push token → PATCH /users/me/push-token.
//     Khi đăng xuất: best-effort DELETE token của thiết bị.
//  2. Chạm vào push (kể cả cold start khi app bị đóng hẳn): trích data
//     { type, job_id, sos_id, ... } → resolveNotificationRoute → điều hướng
//     đúng màn hình. SOS decision còn kích hoạt refreshSosState() để popup
//     quyết định hiện ngay trên màn chi tiết đơn.
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import apiClient from '@/services/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore } from '@/stores/settings.store';
import {
  configurePushForegroundHandler,
  registerForPushNotifications,
} from '@/services/push.service';
import {
  resolveNotificationRoute,
  type NotificationRouteDescriptor,
} from '@/utils/notification-route';
import { refreshSosState } from '@/hooks/use-sos-backup';

const SOS_DECISION_TYPES = new Set(['sos_backup_decision_request', 'sos_backup_decision_reminder']);

export function usePushNotifications() {
  const router = useRouter();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const userId = useAuthStore(s => s.user?._id);
  const handledResponseIds = useRef<Set<string>>(new Set());
  const savedTokenRef = useRef<string | null>(null);
  const wasAuthenticatedRef = useRef(false);
  // S7: push chạm lúc cold start, session chưa restore xong (isAuthenticated
  // còn false) → giữ lại, xử lý sau khi đăng nhập xong để biết active_role.
  const pendingResponseRef = useRef<Notifications.NotificationResponse | null>(null);

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const identifier = response.notification?.request?.identifier;
      if (identifier) {
        if (handledResponseIds.current.has(identifier)) return;
        handledResponseIds.current.add(identifier);
      }
      const content = response.notification?.request?.content;
      const data = (content?.data ?? {}) as Record<string, unknown>;
      const type = typeof data.type === 'string' ? data.type : undefined;
      if (!type) return;

      // Chưa đăng nhập xong (cold start): giữ lại để xử lý khi auth sẵn —
      // resolve ngay lúc này có thể chọn nhầm phía vì active_role chưa rõ.
      if (!useAuthStore.getState().isAuthenticated) {
        pendingResponseRef.current = response;
        return;
      }

      // SOS: làm mới trạng thái SOS để popup quyết định hiện ngay (nếu còn chờ).
      if (SOS_DECISION_TYPES.has(type)) {
        void refreshSosState();
      }
      const authUser = useAuthStore.getState().user;
      const route: NotificationRouteDescriptor | null = resolveNotificationRoute(
        { type, data },
        authUser?.active_role,
        (authUser as { roles?: string[] } | null)?.roles,
      );
      if (route) {
        router.push(route as never);
      } else {
        // P2-8: push không có đích cụ thể thì về danh sách thông báo thay vì
        // chạm mà không có phản hồi gì.
        router.push('/notifications');
      }
    },
    [router],
  );

  // Xử lý push đã giữ lại ngay khi session restore xong.
  useEffect(() => {
    if (!isAuthenticated) return;
    const pending = pendingResponseRef.current;
    if (!pending) return;
    pendingResponseRef.current = null;
    handleResponse(pending);
  }, [isAuthenticated, handleResponse]);

  // ── Đăng ký / gỡ token theo trạng thái đăng nhập ──────────────────────────
  useEffect(() => {
    if (isAuthenticated && userId) {
      wasAuthenticatedRef.current = true;
      let cancelled = false;
      (async () => {
        const token = await registerForPushNotifications();
        if (cancelled || !token) {
          if (!token) console.warn('[usePushNotifications] No push token available to register');
          return;
        }
        savedTokenRef.current = token;
        try {
          const language = useSettingsStore.getState().language;
          await apiClient.patch('/users/me/push-token', { token, language });
        } catch (err: any) {
          console.warn(
            '[usePushNotifications] Failed to patch push token to server:',
            err?.message || err,
          );
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (!isAuthenticated && wasAuthenticatedRef.current) {
      // Vừa đăng xuất: best-effort gỡ token (access token có thể đã bị xoá trước).
      wasAuthenticatedRef.current = false;
      const token = savedTokenRef.current;
      savedTokenRef.current = null;
      if (token) {
        void apiClient.delete('/users/me/push-token', { data: { token } }).catch((err: any) => {
          console.warn(
            '[usePushNotifications] Failed to unregister push token:',
            err?.message || err,
          );
        });
      }
    }
  }, [isAuthenticated, userId]);

  // ── Chạm vào push → deep-link ─────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;
    configurePushForegroundHandler();

    // Cold start: app bị đóng hẳn, user chạm push để mở app.
    void Notifications.getLastNotificationResponseAsync()
      .then(response => {
        handleResponse(response);
        if (response) {
          void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
        }
      })
      .catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, [router, handleResponse]);
}

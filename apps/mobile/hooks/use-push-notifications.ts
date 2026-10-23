// hooks/use-push-notifications.ts — Nối OS push ở root app:
//  1. Khi user đăng nhập: đăng ký Expo push token → PATCH /users/me/push-token.
//     Khi đăng xuất: best-effort DELETE token của thiết bị.
//  2. Chạm vào push (kể cả cold start khi app bị đóng hẳn): trích data
//     { type, job_id, sos_id, ... } → resolveNotificationRoute → điều hướng
//     đúng màn hình. SOS decision còn kích hoạt refreshSosState() để popup
//     quyết định hiện ngay trên màn chi tiết đơn.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import apiClient from '@/services/api-client';
import { useAuthStore } from '@/stores/auth.store';
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

  // ── Đăng ký / gỡ token theo trạng thái đăng nhập ──────────────────────────
  useEffect(() => {
    if (isAuthenticated && userId) {
      wasAuthenticatedRef.current = true;
      let cancelled = false;
      (async () => {
        const token = await registerForPushNotifications();
        if (cancelled || !token) return;
        savedTokenRef.current = token;
        try {
          await apiClient.patch('/users/me/push-token', { token });
        } catch {
          // Lưu token thất bại không quan trọng — lần mở app sau sẽ thử lại.
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
        void apiClient.delete('/users/me/push-token', { data: { token } }).catch(() => undefined);
      }
    }
  }, [isAuthenticated, userId]);

  // ── Chạm vào push → deep-link ─────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;
    configurePushForegroundHandler();

    const handleResponse = (response: Notifications.NotificationResponse | null) => {
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
      }
    };

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
  }, [router]);
}

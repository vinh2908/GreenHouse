// services/toast-navigation.ts — Cầu nối deep-link cho Toast realtime.
//
// react-native-toast-message render ToastCard qua ToastBridge chỉ với
// isVisible/type/text1/text2/hide nên không truyền được route qua props của
// Toast.show. Vì vậy useNotificationSocket lưu route đã resolve vào đây ngay
// khi hiện Toast; ToastCard đọc + tiêu thụ route khi người dùng chạm vào thẻ.
// Toast không có route (toast thường) thì chạm vào không điều hướng.
import type { NotificationRouteDescriptor } from '@/utils/notification-route';

let pendingRoute: NotificationRouteDescriptor | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export function setPendingToastRoute(
  route: NotificationRouteDescriptor | null,
  ttlMs = 6000,
): void {
  pendingRoute = route;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    pendingRoute = null;
    clearTimer = null;
  }, ttlMs);
}

export function takePendingToastRoute(): NotificationRouteDescriptor | null {
  const route = pendingRoute;
  pendingRoute = null;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  return route;
}

// services/push.service.ts — Đăng ký OS push notification (Expo Push Service).
//
// Trước đây app CHƯA từng nối push: socket NOTIFICATION_NEW chỉ tới khi app đang
// mở + còn kết nối. Khi app bị đóng/nền, server ghi DB + gửi push qua service này
// (API: NotificationsService.sendExpoPush) — user chạm vào push thì deep-link
// bằng utils/notification-route.ts (xem hooks/use-push-notifications.ts).
//
// Mọi hàm đều nuốt lỗi và trả null/false: máy ảo, user từ chối quyền, Expo Go
// (Android SDK 53+ không nhận remote push)... không bao giờ được làm crash/chặn app.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

let handlerConfigured = false;

function configureForegroundHandler() {
  if (handlerConfigured) return;
  handlerConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Không cấu hình được handler → push vẫn tới khi app nền/đóng.
  }
}

/**
 * Xin quyền + lấy Expo push token của thiết bị.
 * Trả về null trên web / khi bị từ chối quyền / khi môi trường không hỗ trợ.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;
    configureForegroundHandler();

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Thông báo GreenHouse',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      } catch {
        // Kênh mặc định của Expo vẫn dùng được.
      }
    }

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenResponse?.data ?? null;
  } catch {
    return null;
  }
}

/** Cấu hình cách hiển thị push khi app đang mở (gọi sớm ở root). */
export function configurePushForegroundHandler() {
  if (Platform.OS === 'web') return;
  configureForegroundHandler();
}

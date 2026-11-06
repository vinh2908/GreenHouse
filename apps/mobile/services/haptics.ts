// services/haptics.ts — Phản hồi rung nhẹ (B20).
//
// Chỉ rung ở: nút chính (Button variant primary/gradient), chuyển tab,
// gửi SOS và các xác nhận quan trọng. Không rung ở nút nhỏ/phụ.
// Tôn trọng cài đặt rung hệ thống: trên iOS/Android, expo-haptics đi qua
// motor rung của hệ điều hành nên khi người dùng tắt rung hệ thống thì
// impactAsync không tạo rung; trên web thì no-op hoàn toàn.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export async function lightImpact(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Thiết bị không hỗ trợ rung → bỏ qua, không làm hỏng thao tác
  }
}

export async function successNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // ignore
  }
}

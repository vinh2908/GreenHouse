// hooks/use-callkeep.ts — Nối VoIP/CallKeep ở root app:
//  1. Khởi tạo CallKeep + PushKit listeners 1 lần (service tự no-op khi
//     native module không có: web / Expo Go / bản build chưa link).
//  2. Khi user đăng nhập: gắn callback upload VoIP token → PATCH
//     /users/me/voip-token để API đánh thức được thiết bị khi có cuộc gọi
//     đến lúc app chạy nền / bị đóng hẳn. Khi đăng xuất: best-effort
//     DELETE token của thiết bị (giống vòng đời Expo push token).
import { useEffect, useRef } from 'react';
import apiClient from '@/services/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { callkeepService } from '@/services/callkeep.service';

export function useCallKeep() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const userId = useAuthStore(s => s.user?._id);
  const savedTokenRef = useRef<string | null>(null);
  const wasAuthenticatedRef = useRef(false);

  // Listeners phải gắn sớm nhất có thể — PushKit có thể đánh thức app trước
  // khi trạng thái đăng nhập được khôi phục xong.
  useEffect(() => {
    callkeepService.init();
  }, []);

  useEffect(() => {
    if (isAuthenticated && userId) {
      wasAuthenticatedRef.current = true;
      callkeepService.setTokenUploader((token, platform) => {
        savedTokenRef.current = token;
        void apiClient
          .patch('/users/me/voip-token', { token, platform })
          .catch(() => undefined);
      });
      callkeepService.requestToken();
      return;
    }
    if (!isAuthenticated && wasAuthenticatedRef.current) {
      // Vừa đăng xuất: gỡ callback + best-effort xóa token phía server
      // (access token có thể đã bị xóa trước — lỗi thì bỏ qua như push hook).
      wasAuthenticatedRef.current = false;
      const token = savedTokenRef.current;
      savedTokenRef.current = null;
      callkeepService.setTokenUploader(null);
      if (token) {
        void apiClient
          .delete('/users/me/voip-token', { data: { token } })
          .catch(() => undefined);
      }
    }
  }, [isAuthenticated, userId]);
}

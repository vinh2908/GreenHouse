// utils/role-switch-toast.ts — R11 (M3): chuỗi toast khi đổi vai trò thất bại.
//
// Cả text1 (tiêu đề) lẫn text2 (chi tiết) đều phải theo ngôn ngữ giao diện:
// message server (tiếng Việt) đi qua mapServerErrorMessage — message đã map
// thì dịch, chưa map thì fallback chung tiếng Anh (quy tắc G6), không trả
// nguyên tiếng Việt ở chế độ tiếng Anh.
import { mapServerErrorMessage } from '../services/i18n';

export function roleSwitchFailureToast(
  lang: 'vi' | 'en',
  serverMessage: unknown,
): { text1: string; text2: string } {
  return {
    text1: lang === 'en' ? 'Failed to switch role' : 'Đổi vai trò thất bại',
    text2:
      typeof serverMessage === 'string' && serverMessage.trim()
        ? mapServerErrorMessage(serverMessage, lang)
        : lang === 'en'
          ? 'Please try again later'
          : 'Vui lòng thử lại sau',
  };
}

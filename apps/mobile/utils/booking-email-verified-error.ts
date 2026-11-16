// utils/booking-email-verified-error.ts — R11 (L10): nhận diện lỗi "tài
// khoản chưa xác minh email" khi tạo đơn.
//
// Match CHÍNH theo mã lỗi ổn định EMAIL_NOT_VERIFIED (server A103 +
// HttpExceptionFilter trả về ở data.error.code). Chuỗi message tiếng Việt
// 'chưa được xác minh' chỉ còn là fallback cho API build trước R11 —
// server đổi câu chữ cũng không làm mất lối gửi lại mã xác minh.
export function isEmailNotVerifiedError(err: unknown): boolean {
  const data = (err as { response?: { data?: Record<string, any> } } | null | undefined)?.response
    ?.data;
  if (!data) return false;
  if (data.error?.code === 'EMAIL_NOT_VERIFIED') return true;
  const rawMsg = data.message;
  const msgStr = Array.isArray(rawMsg) ? rawMsg[0] : rawMsg;
  return typeof msgStr === 'string' && msgStr.includes('chưa được xác minh');
}

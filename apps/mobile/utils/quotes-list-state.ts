// utils/quotes-list-state.ts — B6 (R6, 2026-11-14): danh sách báo giá của khách
// PHẢI phân biệt loading / error / empty.
//
// Cơ chế câm đã chứng minh live 2026-11-14 ~08:53 (đơn C): thợ báo giá lại
// sau khi báo giá cũ hết hạn 24h — báo giá MỚI có thật phía server
// (notification tới, header "Có báo giá", đơn ở bước 2) nhưng màn chi tiết
// của khách hiện "Danh sách thợ báo giá (0)" + "Đang quét và gửi đơn tới
// các thợ trong khu vực lân cận..." MÃI (reload nhiều lần, 4+ phút).
// Màn cũ render cùng một placeholder "đang quét" cho CẢ BA trạng thái
// loading / error / empty — fetch báo giá lỗi (mạng/500) cũng giả vờ
// "đang quét" vô thời hạn, khách không bao giờ biết là đã lỗi.
//
// Quy tắc trạng thái (hàm thuần, không import React Native):
//  - 'list'    : đã có ít nhất 1 báo giá — luôn hiện danh sách, kể cả khi
//                poll nền 15s đang fetch hoặc vừa lỗi (dữ liệu cũ còn giá
//                trị hơn màn lỗi);
//  - 'error'   : chưa có dữ liệu VÀ fetch lỗi — hiện lỗi + nút Thử lại,
//                KHÔNG BAO GIỜ giả làm "đang quét" hay danh sách rỗng;
//  - 'loading' : chưa có dữ liệu VÀ fetch đầu tiên đang chạy — chỉ ở đây
//                mới được hiện chữ "đang quét...";
//  - 'empty'   : đã tải xong, 0 báo giá — trạng thái rỗng trung thực, khác
//                loading/error, không chữ "đang quét".
//
// Một báo giá "hồi sinh" (thợ báo lại sau khi hết hạn) về phía client có
// hình dạng Y HỆT một báo giá mới: một row PENDING mới (status 'pending',
// _id mới), helper_id đã populate (full_name/avatar), total_price. Không
// có gì ở payload client phân biệt được "báo lại" với "báo mới" — nên chỉ
// cần danh sách render đúng mọi row PENDING là đủ; phần lọc sai phía
// server (nếu có) thuộc worker R6-A, không sửa ở đây.

export type QuotesListState = 'list' | 'loading' | 'error' | 'empty';

export interface QuotesListStateInput {
  quotes?: readonly unknown[] | null;
  isLoading: boolean;
  isError: boolean;
}

export function resolveQuotesListState(input: QuotesListStateInput): QuotesListState {
  if (input.quotes && input.quotes.length > 0) return 'list';
  if (input.isError) return 'error';
  if (input.isLoading) return 'loading';
  return 'empty';
}

// Trích message lỗi hiện được cho khách từ lỗi fetch (axios / server / Error
// thường). Trả null khi không trích được gì đọc được — màn hình khi đó chỉ
// hiện câu lỗi chung + nút Thử lại.
export function resolveQuotesErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.length > 0 ? error : null;
  }
  const err = error as {
    response?: { data?: { message?: unknown } };
    message?: unknown;
  };
  const serverMessage = err.response?.data?.message;
  if (typeof serverMessage === 'string' && serverMessage.length > 0) return serverMessage;
  if (Array.isArray(serverMessage)) {
    const joined = serverMessage.filter((m): m is string => typeof m === 'string').join('; ');
    if (joined.length > 0) return joined;
  }
  if (typeof err.message === 'string' && err.message.length > 0) return err.message;
  return null;
}

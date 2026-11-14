/**
 * Spec B6 (R6, 2026-11-14): danh sách báo giá của khách phân biệt
 * loading / error / empty — fetch lỗi không được giả làm "đang quét".
 *
 * BUG LIVE 2026-11-14 ~08:53 (đơn C): thợ báo giá lại sau khi báo giá cũ
 * hết hạn 24h — báo giá mới có thật phía server (notification tới, header
 * "Có báo giá", đơn ở bước 2) nhưng màn chi tiết của khách hiện
 * "Danh sách thợ báo giá (0)" + "Đang quét và gửi đơn tới các thợ trong
 * khu vực lân cận..." MÃI (reload nhiều lần, 4+ phút). Màn cũ render cùng
 * một placeholder "đang quét" cho CẢ BA trạng thái loading / error /
 * empty — fetch lỗi cũng giả vờ "đang quét" vô thời hạn.
 *
 * Bản sửa (client, apps/mobile/app/job-detail/[id].tsx): màn hình dùng
 * isLoading/isError/error/refetch của useJobQuotes (hook trả về useQuery
 * nên đã có sẵn — trước đây màn chỉ lấy data nên bỏ qua hết) qua hàm
 * thuần resolveQuotesListState (apps/mobile/utils/quotes-list-state.ts):
 * có dữ liệu → list; chưa có dữ liệu + lỗi → error (lỗi hiện rõ + nút
 * Thử lại); chưa có dữ liệu + fetch đầu đang chạy → loading (chỉ ở đây
 * mới có chữ "đang quét"); tải xong 0 báo giá → empty trung thực.
 * Poll 15s + timeout api-client không đổi.
 *
 * Về phía client, một báo giá "hồi sinh" (báo lại sau hết hạn) có hình
 * dạng Y HỆT một báo giá mới: row PENDING mới (_id mới), helper_id đã
 * populate, total_price — nên spec này chứng minh payload dạng đó cho
 * ra trạng thái 'list' và đủ trường để thẻ báo giá render (tên thợ, giá,
 * _id làm key). Nếu server lọc rơi row đó (nghi vấn: filter profileMap
 * trong getJobQuotes) thì client nhận [] và giờ hiện EMPTY trung thực
 * thay vì "đang quét" — phần server thuộc worker R6-A.
 *
 * Revert check: ở code cũ (3f477b4) util này KHÔNG tồn tại nên import
 * dưới đây fail và toàn bộ spec fail.
 */
import {
  resolveQuotesErrorMessage,
  resolveQuotesListState,
} from '../../../../../apps/mobile/utils/quotes-list-state';

// Payload như GET /jobs/:id/quotes trả về cho khách: row PENDING mới do
// thợ báo LẠI sau khi row cũ hết hạn (row cũ status 'expired' đã bị
// server loại khỏi danh sách, không có trong payload).
const REVIVED_QUOTE = {
  _id: '690f0000000000000000c001',
  job_id: '690f0000000000000000a001',
  helper_id: {
    _id: '690f0000000000000000b001',
    full_name: 'Nguyễn Văn Vinh',
    avatar: 'https://example.invalid/avatar.jpg',
  },
  status: 'pending',
  total_price: 70000,
  created_at: '2026-11-14T08:53:00.000Z',
  expires_at: '2026-11-15T08:53:00.000Z',
};

const FRESH_QUOTE = {
  ...REVIVED_QUOTE,
  _id: '690f0000000000000000c002',
  created_at: '2026-11-14T08:28:00.000Z',
};

describe('B6 (R6): quotes list distinguishes loading / error / empty', () => {
  it('(a) báo giá HỒI SINH (báo lại sau hết hạn) → list, đủ trường render thẻ', () => {
    expect(
      resolveQuotesListState({ quotes: [REVIVED_QUOTE], isLoading: false, isError: false }),
    ).toBe('list');
    // Các trường màn chi tiết đọc để render thẻ báo giá (job-detail [id].tsx):
    expect(REVIVED_QUOTE._id).toBeTruthy();
    expect(REVIVED_QUOTE.helper_id.full_name).toBe('Nguyễn Văn Vinh');
    expect(REVIVED_QUOTE.helper_id.avatar).toBeTruthy();
    expect(REVIVED_QUOTE.total_price).toBe(70000);
    expect(REVIVED_QUOTE.status).toBe('pending');
  });

  it('(b) báo giá MỚI trên đơn mới (luồng E2E cũ) → list, không đổi hành vi', () => {
    expect(
      resolveQuotesListState({ quotes: [FRESH_QUOTE], isLoading: false, isError: false }),
    ).toBe('list');
  });

  it('(c) fetch đầu đang chạy, chưa có dữ liệu → loading (chỉ ở đây mới "đang quét")', () => {
    expect(resolveQuotesListState({ quotes: undefined, isLoading: true, isError: false })).toBe(
      'loading',
    );
    expect(resolveQuotesListState({ quotes: [], isLoading: true, isError: false })).toBe('loading');
  });

  it('(d) fetch LỖI, chưa có dữ liệu → error — không bao giờ là loading hay empty', () => {
    expect(resolveQuotesListState({ quotes: undefined, isLoading: false, isError: true })).toBe(
      'error',
    );
    expect(resolveQuotesListState({ quotes: [], isLoading: false, isError: true })).toBe('error');
    // Kể cả khi isLoading còn true (retry đang chạy) mà lần trước đã lỗi:
    // lỗi vẫn thắng, màn hình không quay lại giả vờ "đang quét".
    expect(resolveQuotesListState({ quotes: [], isLoading: true, isError: true })).toBe('error');
  });

  it('(e) tải xong, 0 báo giá → empty trung thực', () => {
    expect(resolveQuotesListState({ quotes: [], isLoading: false, isError: false })).toBe('empty');
    expect(resolveQuotesListState({ quotes: undefined, isLoading: false, isError: false })).toBe(
      'empty',
    );
  });

  it('(f) đã có báo giá mà poll nền 15s lỗi/fetch lại → vẫn list (dữ liệu cũ thắng)', () => {
    expect(
      resolveQuotesListState({ quotes: [REVIVED_QUOTE], isLoading: false, isError: true }),
    ).toBe('list');
    expect(
      resolveQuotesListState({ quotes: [REVIVED_QUOTE], isLoading: true, isError: false }),
    ).toBe('list');
  });

  it('(g) message lỗi trích được, hiện rõ cho khách', () => {
    expect(resolveQuotesErrorMessage({ message: 'Request failed with status code 500' })).toBe(
      'Request failed with status code 500',
    );
    expect(
      resolveQuotesErrorMessage({
        response: { data: { message: 'Job không tồn tại' } },
      }),
    ).toBe('Job không tồn tại');
    expect(resolveQuotesErrorMessage({ response: { data: { message: ['a', 'b'] } } })).toBe('a; b');
    expect(resolveQuotesErrorMessage({})).toBeNull();
    expect(resolveQuotesErrorMessage(null)).toBeNull();
    expect(resolveQuotesErrorMessage(undefined)).toBeNull();
  });
});

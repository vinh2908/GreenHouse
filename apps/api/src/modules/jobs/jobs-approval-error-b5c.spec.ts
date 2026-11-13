/**
 * Spec B5c: mọi lỗi ở luồng nghiệm thu/thanh toán của khách phải hiện được.
 *
 * CƠ CHẾ CÂM đã chứng minh live 2026-11-13 (đơn B 6af59e07bb2b94f98da7e088):
 * khách bấm "Xác nhận nghiệm thu & Thanh toán" ở bước 7 pending_review, đơn
 * 0 ảnh hoàn thành — KHÔNG có gì xảy ra: không toast, không lỗi, đơn ở yên
 * bước 7, ví không trừ tiền. handleSubmitReview ĐÃ chạy và ĐÃ toast (cổng
 * P0-3 thấy completion_photos rỗng nên toast 'Thợ chưa tải ảnh bằng chứng
 * hoàn thành' rồi return — pay/approve không chạy nên ví không trừ là ĐÚNG).
 * Toast đó vô hình vì ToastCard duy nhất nằm ở root (position 'absolute',
 * không zIndex) còn review Modal là RN <Modal> — trên web RNW portal Modal
 * vào div append vào document.body SAU app root nên modal phủ lên ToastCard;
 * trên native Modal cũng là layer riêng phủ toàn bộ view hierarchy. Toast
 * sống ~4s rồi tắt, toàn bộ thời gian đó nằm sau modal đang mở.
 *
 * Bản sửa: mọi lỗi ở luồng này còn được ghi vào reviewError — banner đỏ
 * inline ĐÃ CÓ sẵn trong modal — để khách thấy lỗi ngay trong modal đang
 * mở. resolveApprovalErrorMessage (apps/mobile/utils/approval-error.ts) là
 * hàm thuần trích message lỗi hiện được: message server nguyên văn (kể cả
 * B57), message dạng array nối lại, lỗi lạ → fallback đọc được.
 *
 * Revert check: ở code cũ (ce3e227) util này KHÔNG tồn tại nên import dưới
 * đây fail và toàn bộ spec fail — đã kiểm chứng bằng worktree ở ce3e227
 * (xem log ~/workspace/.tmp/review-live-r3-gates/c-spec.log).
 */
import {
  missingCompletionEvidenceText,
  resolveApprovalErrorMessage,
} from '../../../../../apps/mobile/utils/approval-error';

const B57 =
  'Chưa có ảnh bằng chứng hoàn thành. Vui lòng yêu cầu thợ chụp ảnh hoàn thành trước khi nghiệm thu.';

describe('B5c: approval errors surface a readable message', () => {
  it('(a) message server B57 dạng string → hiện nguyên văn (đúng ca đơn B live)', () => {
    const err = { response: { data: { message: B57 } } };
    expect(resolveApprovalErrorMessage(err, 'vi')).toBe(B57);
    // Chế độ EN cũng hiện nguyên văn message server (interceptor đã dịch/map
    // trước đó nếu cần) — không được thay bằng fallback chung chung.
    expect(resolveApprovalErrorMessage(err, 'en')).toBe(B57);
  });

  it('(b) message server dạng string[] (Nest validation) → nối thành một chuỗi đọc được', () => {
    const err = {
      response: { data: { message: ['rating must be a number', 'review is too long'] } },
    };
    expect(resolveApprovalErrorMessage(err, 'vi')).toBe(
      'rating must be a number; review is too long',
    );
    // Mảng 1 phần tử → chính phần tử đó, không thêm dấu nối.
    expect(resolveApprovalErrorMessage({ response: { data: { message: [B57] } } }, 'vi')).toBe(B57);
  });

  it('(c) message array toàn chuỗi rỗng → fallback đọc được, không chuỗi rỗng', () => {
    expect(resolveApprovalErrorMessage({ response: { data: { message: ['', '  '] } } }, 'vi')).toBe(
      'Gửi nghiệm thu thất bại',
    );
    expect(resolveApprovalErrorMessage({ response: { data: { message: [] } } }, 'en')).toBe(
      'Submission failed',
    );
  });

  it('(d) không có message server (null/undefined/{} / lỗi mạng/timeout) → fallback đọc được', () => {
    expect(resolveApprovalErrorMessage(null, 'vi')).toBe('Gửi nghiệm thu thất bại');
    expect(resolveApprovalErrorMessage(undefined, 'en')).toBe('Submission failed');
    expect(resolveApprovalErrorMessage({}, 'vi')).toBe('Gửi nghiệm thu thất bại');
    expect(resolveApprovalErrorMessage({ response: { data: {} } }, 'en')).toBe('Submission failed');
    // Text kỹ thuật của axios không bao giờ hiện nguyên văn cho khách.
    expect(resolveApprovalErrorMessage(new Error('Network Error'), 'vi')).toBe(
      'Gửi nghiệm thu thất bại',
    );
    expect(resolveApprovalErrorMessage(new Error('timeout of 35000ms exceeded'), 'en')).toBe(
      'Submission failed',
    );
  });

  it('(e) fallback riêng của từng bước được tôn trọng khi không có message server', () => {
    const stepFallback =
      'Nghiệm thu thành công nhưng chưa lưu được đánh giá. Vui lòng bấm thử lại.';
    expect(resolveApprovalErrorMessage({}, 'vi', stepFallback)).toBe(stepFallback);
    // Có message server thì message server thắng, fallback riêng không dùng.
    expect(
      resolveApprovalErrorMessage({ response: { data: { message: B57 } } }, 'vi', stepFallback),
    ).toBe(B57);
  });

  it('(f) cổng P0-3 thiếu ảnh: title + detail VI/EN đúng chuỗi toast cũ đã live', () => {
    expect(missingCompletionEvidenceText('vi')).toEqual({
      title: 'Thợ chưa tải ảnh bằng chứng hoàn thành',
      detail: 'Hãy yêu cầu thợ tải ảnh hoàn thành trước khi nghiệm thu — chưa trừ tiền.',
    });
    expect(missingCompletionEvidenceText('en')).toEqual({
      title: 'Helper has not uploaded completion photos yet',
      detail: 'Ask the helper to upload completion photos before approval — no payment was taken.',
    });
  });
});

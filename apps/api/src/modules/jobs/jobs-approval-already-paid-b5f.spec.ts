/**
 * Spec B5f: sau lỗi pay "đã được thanh toán", chỉ approve khi refetch thấy
 * payment_status === 'paid'.
 *
 * Cơ chế đã chứng minh live 2026-11-13 (đơn B 6af59e07bb2b94f98da7e088):
 * khách bấm "Xác nhận nghiệm thu & Thanh toán" ở bước 7 pending_review —
 * pay lần đầu kẹt PROCESSING, server trả Conflict "Đơn hàng này đã được
 * thanh toán hoặc đang được xử lý thanh toán". Client cũ match regex
 * /đã được thanh toán|already paid/i rồi coi như "đã trả rồi" và approve
 * luôn, không kiểm tra payment_status; approve ném "Đơn hàng chưa được
 * thanh toán trực tuyến thành công" vì payment_status vẫn PROCESSING.
 *
 * Bản sửa (handleSubmitReview, apps/mobile/app/job-detail/[id].tsx):
 * sau shortcut "already paid" refetch job rồi gọi
 * alreadyPaidRefetchAllowsApprove — chỉ proceed approve khi refetch thấy
 * 'paid'; chưa paid thì dừng, hiện unfinishedPaymentText bằng banner inline
 * reviewError (cơ chế B5c), KHÔNG gọi approve.
 *
 * Revert check: ở code cũ util này KHÔNG tồn tại nên import dưới đây fail
 * và toàn bộ spec fail — kiểm chứng bằng `git stash` util về base rồi chạy
 * lại spec (xem log trong report của worker R5-F).
 */
import {
  alreadyPaidRefetchAllowsApprove,
  unfinishedPaymentText,
} from '../../../../../apps/mobile/utils/approval-error';

describe('B5f: already-paid shortcut must verify payment_status is paid', () => {
  it("(a) refetch thấy payment_status 'paid' → proceed approve (happy path giữ nguyên)", () => {
    expect(alreadyPaidRefetchAllowsApprove({ payment_status: 'paid' })).toBe(true);
    expect(alreadyPaidRefetchAllowsApprove({ payment_status: 'paid', status: 'completed' })).toBe(
      true,
    );
  });

  it("(b) refetch thấy 'processing' (đúng ca đơn B live) → KHÔNG approve", () => {
    expect(alreadyPaidRefetchAllowsApprove({ payment_status: 'processing' })).toBe(false);
  });

  it("(c) refetch thấy 'unpaid' / trạng thái khác / job rỗng → KHÔNG approve", () => {
    expect(alreadyPaidRefetchAllowsApprove({ payment_status: 'unpaid' })).toBe(false);
    expect(alreadyPaidRefetchAllowsApprove({ payment_status: 'failed' })).toBe(false);
    expect(alreadyPaidRefetchAllowsApprove({ payment_status: 'PAID' })).toBe(false);
    expect(alreadyPaidRefetchAllowsApprove({})).toBe(false);
    expect(alreadyPaidRefetchAllowsApprove(null)).toBe(false);
    expect(alreadyPaidRefetchAllowsApprove(undefined)).toBe(false);
  });

  it('(d) thông báo chưa hoàn tất thanh toán VI/EN đọc được, không lộ text kỹ thuật', () => {
    expect(unfinishedPaymentText('vi')).toBe('Thanh toán chưa hoàn tất, vui lòng thử lại');
    expect(unfinishedPaymentText('en')).toBe('Payment is not complete yet, please try again.');
  });
});

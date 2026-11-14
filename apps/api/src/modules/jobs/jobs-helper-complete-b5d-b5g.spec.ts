/**
 * Spec B5d + B5g (live R5): thợ gửi bằng chứng hoàn thành và xác nhận tiền mặt.
 *
 * B5d — CƠ CHẾ CÂM đã chứng minh live 2026-11-13: thợ gửi bằng chứng (1 ảnh +
 * 1 video) trong complete modal, submit xoay rồi lỗi mà KHÔNG có lỗi nào hiện
 * — Toast vô hình vì ToastCard ở root nằm sau RN <Modal> (cùng cơ chế B5c ở
 * phía khách). Bản sửa: lỗi còn được ghi vào completeError — banner đỏ inline
 * trong chính modal (pattern setReviewError của B5c). resolveCompleteErrorMessage
 * (apps/mobile/utils/helper-complete-error.ts) là hàm thuần trích thông báo
 * hiện được: message server nguyên văn, message dạng array nối lại, lỗi
 * mạng/lạ → fallback riêng của bước gửi bằng chứng.
 *
 * B5g — server ĐÃ có POST /jobs/:id/confirm-cash nhưng app KHÔNG có UI nào
 * gọi nó, nên nghiệm thu tiền mặt không thỏa được cổng P0-4 ở approveCompletion
 * (helper_cash_confirmed hoặc giao dịch tiền mặt đã ghi nhận). Nút "Xác nhận
 * đã nhận tiền mặt" chỉ hiện ở pending_review + thợ được giao + luồng tiền
 * mặt (payment_method === 'cash', hoặc chưa ghi nhận phương thức online nào),
 * không bao giờ hiện cho đơn online / đơn bảo hành / khi đã xác nhận.
 * shouldShowCashConfirmButton + isCashPaymentFlow
 * (apps/mobile/utils/cash-confirm.ts) là các hàm thuần quyết định việc đó.
 *
 * Revert check: ở code base (0121b80) hai util trên KHÔNG tồn tại nên import
 * dưới đây fail và toàn bộ spec fail.
 */
import {
  resolveCompleteErrorMessage,
  shouldShowCompleteErrorBanner,
} from '../../../../../apps/mobile/utils/helper-complete-error';
import {
  isCashPaymentFlow,
  resolveCashConfirmErrorMessage,
  shouldShowCashConfirmButton,
  type CashConfirmJobInput,
} from '../../../../../apps/mobile/utils/cash-confirm';

describe('B5d: complete-submission error produces an inline banner message', () => {
  it('(a) message server dạng string → hiện nguyên văn trong banner', () => {
    const serverMsg = 'Không thể cập nhật đơn hàng. Vui lòng thử lại.';
    const err = { response: { data: { message: serverMsg } } };
    expect(resolveCompleteErrorMessage(err, 'vi')).toBe(serverMsg);
    expect(resolveCompleteErrorMessage(err, 'en')).toBe(serverMsg);
  });

  it('(b) message server dạng string[] → nối thành một chuỗi đọc được', () => {
    const err = { response: { data: { message: ['upload failed', 'retry later'] } } };
    expect(resolveCompleteErrorMessage(err, 'vi')).toBe('upload failed; retry later');
  });

  it('(c) lỗi mạng/timeout/không có message server → fallback riêng của bước gửi bằng chứng', () => {
    expect(resolveCompleteErrorMessage(new Error('Network Error'), 'vi')).toBe(
      'Gửi bằng chứng hoàn thành thất bại. Vui lòng thử lại.',
    );
    expect(resolveCompleteErrorMessage(new Error('timeout of 120000ms exceeded'), 'en')).toBe(
      'Failed to submit completion evidence. Please try again.',
    );
    expect(resolveCompleteErrorMessage(null, 'vi')).toBe(
      'Gửi bằng chứng hoàn thành thất bại. Vui lòng thử lại.',
    );
    expect(resolveCompleteErrorMessage({}, 'en')).toBe(
      'Failed to submit completion evidence. Please try again.',
    );
  });

  it('(d) fallback là của bước gửi bằng chứng — KHÔNG phải fallback nghiệm thu của khách', () => {
    // Phân biệt với resolveApprovalErrorMessage ('Gửi nghiệm thu thất bại'):
    // thợ đang ở màn gửi bằng chứng, thông báo phải nói đúng bước đó.
    expect(resolveCompleteErrorMessage(null, 'vi')).not.toBe('Gửi nghiệm thu thất bại');
    expect(resolveCompleteErrorMessage(null, 'en')).not.toBe('Submission failed');
  });

  it('(e) banner chỉ hiện khi có thông báo lỗi thật', () => {
    expect(shouldShowCompleteErrorBanner('Gửi bằng chứng hoàn thành thất bại.')).toBe(true);
    expect(shouldShowCompleteErrorBanner(null)).toBe(false);
    expect(shouldShowCompleteErrorBanner(undefined)).toBe(false);
    expect(shouldShowCompleteErrorBanner('')).toBe(false);
    expect(shouldShowCompleteErrorBanner('   ')).toBe(false);
  });
});

describe('B5g: cash-confirm button shows only at pending_review + cash', () => {
  const cashJob = (over: Partial<CashConfirmJobInput> = {}): CashConfirmJobInput => ({
    status: 'pending_review',
    payment_method: 'cash',
    payment_status: 'unpaid',
    helper_cash_confirmed: false,
    is_warranty: false,
    ...over,
  });

  it('(a) pending_review + cash + thợ được giao → hiện nút', () => {
    expect(shouldShowCashConfirmButton(cashJob(), true)).toBe(true);
  });

  it('(b) pending_review + chưa chọn phương thức + chưa paid → hiện nút (khách chọn ở bước nghiệm thu, mặc định cash)', () => {
    expect(shouldShowCashConfirmButton(cashJob({ payment_method: undefined }), true)).toBe(true);
    expect(shouldShowCashConfirmButton(cashJob({ payment_method: '' }), true)).toBe(true);
    expect(shouldShowCashConfirmButton(cashJob({ payment_method: null }), true)).toBe(true);
  });

  it('(c) đơn online → KHÔNG bao giờ hiện, kể cả đúng bước 7 và đúng thợ', () => {
    for (const method of ['vietqr', 'momo', 'wallet', 'zalopay', ' VietQR ', 'MOMO']) {
      expect(shouldShowCashConfirmButton(cashJob({ payment_method: method }), true)).toBe(false);
      expect(isCashPaymentFlow(cashJob({ payment_method: method }))).toBe(false);
    }
  });

  it('(d) chưa chọn phương thức nhưng đã paid → không hiện (tiền online đã được ghi nhận)', () => {
    expect(
      shouldShowCashConfirmButton(
        cashJob({ payment_method: undefined, payment_status: 'paid' }),
        true,
      ),
    ).toBe(false);
  });

  it('(e) trạng thái khác pending_review → không hiện, kể cả đơn cash', () => {
    for (const status of [
      'open',
      'confirmed',
      'helper_on_the_way',
      'in_progress',
      'completed',
      'cancelled',
      'disputed',
    ]) {
      expect(shouldShowCashConfirmButton(cashJob({ status }), true)).toBe(false);
    }
  });

  it('(f) không phải thợ được giao → không hiện', () => {
    expect(shouldShowCashConfirmButton(cashJob(), false)).toBe(false);
  });

  it('(g) thợ đã xác nhận rồi → không hiện lại nút', () => {
    expect(shouldShowCashConfirmButton(cashJob({ helper_cash_confirmed: true }), true)).toBe(false);
  });

  it('(h) đơn bảo hành → không hiện (P0-4 miễn cổng tiền mặt cho bảo hành)', () => {
    expect(shouldShowCashConfirmButton(cashJob({ is_warranty: true }), true)).toBe(false);
    expect(isCashPaymentFlow(cashJob({ is_warranty: true }))).toBe(false);
  });

  it('(i) job null → không hiện, không throw', () => {
    expect(shouldShowCashConfirmButton(null, true)).toBe(false);
    expect(isCashPaymentFlow(null)).toBe(false);
  });

  it('(j) lỗi xác nhận tiền mặt → fallback riêng của bước xác nhận tiền mặt', () => {
    expect(resolveCashConfirmErrorMessage(new Error('Network Error'), 'vi')).toBe(
      'Xác nhận nhận tiền mặt thất bại. Vui lòng thử lại.',
    );
    expect(resolveCashConfirmErrorMessage(null, 'en')).toBe(
      'Failed to confirm cash receipt. Please try again.',
    );
    const serverMsg = 'Chỉ thợ của đơn hàng mới có quyền xác nhận nhận tiền mặt';
    expect(
      resolveCashConfirmErrorMessage({ response: { data: { message: serverMsg } } }, 'vi'),
    ).toBe(serverMsg);
  });
});

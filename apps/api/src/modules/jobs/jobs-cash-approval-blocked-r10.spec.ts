/**
 * Spec R10 (client): lỗi P0-4 chặn nghiệm thu đơn tiền mặt phải hiện được
 * cho khách ở cả hai ngôn ngữ, qua banner đỏ inline trong modal nghiệm thu.
 *
 * Chuỗi lỗi: approveCompletion (apps/api/src/modules/jobs/jobs.service.ts
 * ~4148) ném BadRequest khi helper_cash_confirmed !== true (sau fix R10 của
 * server, cổng hasRecordedCashPayment không còn tự thỏa):
 *   'Thợ chưa xác nhận đã nhận tiền mặt từ khách. Vui lòng yêu cầu thợ bấm
 *    xác nhận đã nhận tiền mặt trước khi nghiệm thu đơn tiền mặt.'
 *
 * Đường đi của lỗi tới banner (apps/mobile/app/job-detail/[id].tsx):
 *   approveJob.mutateAsync (use-api.ts ~652, apiClient.patch /jobs/:id/approve)
 *   → response interceptor (services/api-client.ts ~251) viết lại
 *     error.response.data.message bằng mapServerErrorMessage(msg, lang)
 *   → catch ở handleSubmitReview (~1101): resolveApprovalErrorMessage(err, lang)
 *   → setReviewError(msg) → banner đỏ inline trong modal (~3478).
 * resolveApprovalErrorMessage tự nó đã pass-through message server nguyên văn
 * (spec B5c), NHƯNG interceptor chạy TRƯỚC nó: ở chế độ EN, mapServerErrorMessage
 * chỉ có exact-match cho biến thể admin ('... Không thể hoàn thành đơn tiền
 * mặt.') và cho prefix trần — message P0-4 đầy đủ miss cả exact-match lẫn
 * 4 regex fallback nên rơi về 'Something went wrong, please try again' và
 * banner hiện fallback chung thay vì hướng dẫn "yêu cầu thợ bấm xác nhận".
 * Ở chế độ VI thì verbatim (map trả trimmed khi lang !== 'en') nên không lỗi.
 *
 * Bản sửa: 1 entry exact-match cho message P0-4 đầy đủ trong
 * SERVER_ERROR_EN_MAP (apps/mobile/services/i18n.ts).
 *
 * Revert check: ở code cũ (không có entry này) test (b) + (c) fail — map trả
 * fallback chung 'Something went wrong, please try again'.
 */
import { mapServerErrorMessage } from '../../../../../apps/mobile/services/i18n';
import {
  alreadyPaidRefetchAllowsApprove,
  resolveApprovalErrorMessage,
} from '../../../../../apps/mobile/utils/approval-error';

const P0_4_CASH_NOT_CONFIRMED =
  'Thợ chưa xác nhận đã nhận tiền mặt từ khách. Vui lòng yêu cầu thợ bấm xác nhận đã nhận tiền mặt trước khi nghiệm thu đơn tiền mặt.';

const P0_4_EN =
  'Helper has not confirmed receiving cash from customer. Please ask the helper to tap "Confirm cash received" before approving this cash job.';

describe('R10: P0-4 cash-approval block surfaces in the review banner', () => {
  it('(a) VI: interceptor map trả nguyên văn, resolver pass-through → banner hiện đúng hướng dẫn', () => {
    expect(mapServerErrorMessage(P0_4_CASH_NOT_CONFIRMED, 'vi')).toBe(P0_4_CASH_NOT_CONFIRMED);
    const err = { response: { data: { message: P0_4_CASH_NOT_CONFIRMED } } };
    expect(resolveApprovalErrorMessage(err, 'vi')).toBe(P0_4_CASH_NOT_CONFIRMED);
  });

  it('(b) EN: interceptor map phải dịch message P0-4 đầy đủ, KHÔNG rơi về fallback chung', () => {
    expect(mapServerErrorMessage(P0_4_CASH_NOT_CONFIRMED, 'en')).toBe(P0_4_EN);
  });

  it('(c) EN end-to-end chain: message đã map → resolver → đúng chuỗi banner (handleSubmitReview catch)', () => {
    const mapped = mapServerErrorMessage(P0_4_CASH_NOT_CONFIRMED, 'en');
    const err = { response: { data: { message: mapped } } };
    expect(resolveApprovalErrorMessage(err, 'en')).toBe(P0_4_EN);
    expect(mapped).not.toBe('Something went wrong, please try again');
  });

  it('(d) P0-4 không bị phân loại nhầm vào nhánh "đã được thanh toán" (pay catch ở handleSubmitReview)', () => {
    // Nhánh pay chỉ nuốt lỗi match /đã được thanh toán|already paid/i; P0-4
    // ném từ approve (ngoài try pay) và không chứa cụm đó nên đi thẳng tới
    // catch ngoài → banner, không qua cổng alreadyPaidRefetchAllowsApprove.
    expect(/đã được thanh toán|already paid/i.test(P0_4_CASH_NOT_CONFIRMED)).toBe(false);
    expect(alreadyPaidRefetchAllowsApprove({ payment_status: 'unpaid' })).toBe(false);
    expect(alreadyPaidRefetchAllowsApprove({ payment_status: 'paid' })).toBe(true);
  });

  it('(e) hồi quy: biến thể admin + fallback chung của G6 không đổi', () => {
    expect(
      mapServerErrorMessage(
        'Thợ chưa xác nhận đã nhận tiền mặt từ khách. Không thể hoàn thành đơn tiền mặt.',
        'en',
      ),
    ).toBe('Helper has not confirmed receiving cash from customer. Cannot complete cash job.');
    expect(mapServerErrorMessage('Lỗi hệ thống bất định chưa từng định nghĩa', 'en')).toBe(
      'Something went wrong, please try again',
    );
    expect(mapServerErrorMessage('Lỗi hệ thống bất định chưa từng định nghĩa', 'vi')).toBe(
      'Lỗi hệ thống bất định chưa từng định nghĩa',
    );
  });
});

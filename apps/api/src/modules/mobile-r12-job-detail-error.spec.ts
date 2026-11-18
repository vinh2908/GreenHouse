// modules/mobile-r12-job-detail-error.spec.ts — R12-26: classify a
// job-detail fetch failure. Old code: the customer screen ignored the
// error entirely and rendered EVERY failure as "Không tìm thấy thông tin
// đơn hàng" (including a 410 for a cancelled job and a transient network
// failure); the helper screen showed only the generic "Đơn này không còn
// khả dụng". These cases fail on the old behaviour and pass after.
import { resolveJobDetailErrorState } from '@/utils/job-detail-error';

function axiosError(status: number, message: string, code?: string): unknown {
  return {
    response: {
      status,
      data: {
        success: false,
        message,
        error: { code: code ?? 'Gone', details: [] },
      },
    },
  };
}

describe('R12-26: resolveJobDetailErrorState', () => {
  it('410 + "Đơn này đã bị hủy" → gone_cancelled (not "not found")', () => {
    expect(
      resolveJobDetailErrorState(axiosError(410, 'Đơn này đã bị hủy', 'Gone')),
    ).toEqual({ kind: 'gone_cancelled', serverMessage: 'Đơn này đã bị hủy' });
  });

  it('410 + generic message → gone_other', () => {
    expect(
      resolveJobDetailErrorState(axiosError(410, 'Đơn này không còn khả dụng', 'Gone')),
    ).toEqual({ kind: 'gone_other', serverMessage: 'Đơn này không còn khả dụng' });
  });

  it('410 matched by error code even without a status', () => {
    expect(
      resolveJobDetailErrorState({
        response: { data: { message: 'Đơn này đã bị hủy', error: { code: 'gone' } } },
      }),
    ).toEqual({ kind: 'gone_cancelled', serverMessage: 'Đơn này đã bị hủy' });
  });

  it('404 → not_found (the only case that keeps the old text)', () => {
    expect(
      resolveJobDetailErrorState(axiosError(404, 'Job không tồn tại', 'NOT_FOUND')),
    ).toEqual({ kind: 'not_found', serverMessage: 'Job không tồn tại' });
  });

  it('403 → forbidden', () => {
    expect(
      resolveJobDetailErrorState(
        axiosError(403, 'Bạn không có quyền xem công việc này', 'FORBIDDEN'),
      ),
    ).toEqual({ kind: 'forbidden', serverMessage: 'Bạn không có quyền xem công việc này' });
  });

  it('no response at all → network (retryable, never "not found")', () => {
    expect(resolveJobDetailErrorState(new Error('Network Error'))).toEqual({
      kind: 'network',
      serverMessage: undefined,
    });
    expect(resolveJobDetailErrorState({ code: 'ECONNABORTED' })).toEqual({
      kind: 'network',
      serverMessage: undefined,
    });
  });

  it('5xx → server (even with a stray "Gone" code — status wins)', () => {
    expect(
      resolveJobDetailErrorState(axiosError(500, 'Internal server error', 'Gone')),
    ).toEqual({
      kind: 'server',
      serverMessage: 'Internal server error',
    });
    expect(
      resolveJobDetailErrorState(
        axiosError(500, 'Internal server error', 'INTERNAL_SERVER_ERROR'),
      ),
    ).toEqual({
      kind: 'server',
      serverMessage: 'Internal server error',
    });
  });
});

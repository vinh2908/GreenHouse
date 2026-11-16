import { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { JobStatus, PaymentStatus } from '@homemate/types';

/**
 * L2 (R11): confirmCashPayment chỉ được set cờ trên đơn PENDING_REVIEW.
 * Trước R11, thợ được giao có thể bấm xác nhận ở bất kỳ trạng thái nào — một
 * lần xác nhận sớm sẽ nằm sẵn đó và tự thỏa gate P0-4/R10 ở bước nghiệm thu
 * sau này. Client chỉ hiện nút ở bước 7 (shouldShowCashConfirmButton yêu cầu
 * status === 'pending_review'); server phải chặn giống vậy.
 *
 * Review R11: cờ chỉ có nghĩa khi đơn ở luồng tiền mặt (isCashPaymentFlow):
 * đơn đã thu online (vietqr/wallet PAID) mà thợ bấm xác nhận trước rồi khách
 * đổi sang cash ở bước nghiệm thu sẽ lách gate P0-4 dù thợ chưa hề cầm tiền
 * mặt. Đơn chưa chọn phương thức + chưa thanh toán vẫn xác nhận được (khách
 * có thể trả tiền mặt sau).
 */
function makeService(
  jobStatus: JobStatus,
  opts: { paymentMethod?: string; paymentStatus?: PaymentStatus } = {},
) {
  const helperId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const jobDoc: any = {
    _id: jobId,
    customer_id: new Types.ObjectId(),
    helper_id: helperId,
    status: jobStatus,
    // 'paymentMethod' in opts cho phép truyền undefined tường minh (đơn chưa
    // chọn phương thức) thay vì bị ?? 'cash' nuốt mất.
    payment_method: 'paymentMethod' in opts ? opts.paymentMethod : 'cash',
    payment_status: 'paymentStatus' in opts ? opts.paymentStatus : PaymentStatus.UNPAID,
    helper_cash_confirmed: false,
    helper_cash_confirmed_at: undefined,
    events: [],
    save: jest.fn().mockResolvedValue(undefined),
  };
  const jobModel = {
    findById: jest.fn(() => ({ exec: async () => jobDoc })),
  };
  const dummy = {} as never;
  const service = new JobsService(
    jobModel as never,
    dummy, dummy, dummy, dummy, dummy, dummy,
    { emitToJob: jest.fn(), emitToUser: jest.fn() } as never,
    { create: jest.fn(async () => ({})) } as never,
    dummy, dummy, dummy, dummy, dummy, dummy, dummy,
  );
  return { service, jobDoc, helperId, jobId };
}

describe('JobsService.confirmCashPayment — PENDING_REVIEW only (L2/R11)', () => {
  it('xác nhận trên đơn IN_PROGRESS → chặn, cờ không đổi', async () => {
    const { service, jobDoc, helperId, jobId } = makeService(JobStatus.IN_PROGRESS);

    await expect(
      service.confirmCashPayment(String(helperId), String(jobId)),
    ).rejects.toThrow('chờ khách nghiệm thu');

    expect(jobDoc.helper_cash_confirmed).toBe(false);
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  it('xác nhận trên đơn COMPLETED → chặn, cờ không đổi', async () => {
    const { service, jobDoc, helperId, jobId } = makeService(JobStatus.COMPLETED);

    await expect(
      service.confirmCashPayment(String(helperId), String(jobId)),
    ).rejects.toThrow('chờ khách nghiệm thu');

    expect(jobDoc.helper_cash_confirmed).toBe(false);
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  it('xác nhận trên đơn PENDING_REVIEW → thành công, set cờ + thời điểm', async () => {
    const { service, jobDoc, helperId, jobId } = makeService(JobStatus.PENDING_REVIEW);

    const result = await service.confirmCashPayment(String(helperId), String(jobId));

    expect(result.helper_cash_confirmed).toBe(true);
    expect(jobDoc.helper_cash_confirmed_at).toBeInstanceOf(Date);
    expect(jobDoc.save).toHaveBeenCalledTimes(1);
  });

  it('xác nhận trên đơn vietqr ĐÃ thu tiền (PAID) ở PENDING_REVIEW → chặn, cờ không đổi', async () => {
    const { service, jobDoc, helperId, jobId } = makeService(JobStatus.PENDING_REVIEW, {
      paymentMethod: 'vietqr',
      paymentStatus: PaymentStatus.PAID,
    });

    await expect(service.confirmCashPayment(String(helperId), String(jobId))).rejects.toThrow(
      'thanh toán bằng tiền mặt',
    );

    expect(jobDoc.helper_cash_confirmed).toBe(false);
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  it('xác nhận trên đơn chưa chọn phương thức + chưa thanh toán ở PENDING_REVIEW → thành công', async () => {
    const { service, jobDoc, helperId, jobId } = makeService(JobStatus.PENDING_REVIEW, {
      paymentMethod: undefined,
      paymentStatus: PaymentStatus.UNPAID,
    });

    const result = await service.confirmCashPayment(String(helperId), String(jobId));

    expect(result.helper_cash_confirmed).toBe(true);
    expect(jobDoc.save).toHaveBeenCalledTimes(1);
  });
});

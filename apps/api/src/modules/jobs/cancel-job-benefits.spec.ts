import { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { JobStatus } from '@homemate/types';

/**
 * Spec kiểm chứng khôi phục voucher + điểm loyalty khi hủy đơn thường
 * (JobsService.cancelJob & restoreJobBenefitsOnCancel):
 * 1. Hủy đơn có voucher + điểm: hoàn đúng 1 lần cho khách (customerId, jobId).
 * 2. Lặp lại/gọi lại (replay): cờ benefits_restored_at đã claim -> không hoàn thêm.
 * 3. Best-effort: lỗi khi hoàn voucher không chặn hoàn điểm và không làm sập tiến trình hủy.
 */

type Doc = Record<string, unknown>;

const eq = (a: unknown, b: unknown): boolean =>
  a instanceof Types.ObjectId || b instanceof Types.ObjectId ? String(a) === String(b) : a === b;

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or') {
      if (!(cond as Record<string, unknown>[]).some(f => matches(doc, f))) return false;
      continue;
    }
    const val = doc[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Types.ObjectId)) {
      const ops = cond as Record<string, unknown>;
      if ('$exists' in ops && (val !== undefined) !== Boolean(ops['$exists'])) return false;
      if ('$ne' in ops && eq(val, ops['$ne'])) return false;
      continue;
    }
    if (!eq(val, cond)) return false;
  }
  return true;
}

function makeJobsService(opts?: { voucherThrows?: boolean }) {
  const customerId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  const jobRecord: Doc = {
    _id: jobId,
    customer_id: customerId,
    status: JobStatus.OPEN,
    title: 'Dọn dẹp nhà cửa',
    events: [],
    save: jest.fn(async function (this: Doc) {
      return this;
    }),
  };

  const jobModel = {
    findById: jest.fn(() => ({
      exec: async () => jobRecord,
    })),
    findOneAndUpdate: jest.fn((filter: Record<string, unknown>, update: Record<string, unknown>) => ({
      exec: async () => {
        if (!matches(jobRecord, filter)) return null;
        Object.assign(jobRecord, (update['$set'] as Doc) ?? {});
        return jobRecord;
      },
    })),
  };

  const quoteModel = {
    updateMany: jest.fn(() => ({
      exec: async () => ({ modifiedCount: 0 }),
    })),
  };

  const vouchersService = {
    restoreForJob: jest.fn(async () => {
      if (opts?.voucherThrows) throw new Error('voucher service network timeout');
      return { restored: true, discount_amount: 30_000, code: 'GIAM30' };
    }),
  };

  const loyaltyService = {
    reverseRedeemForJob: jest.fn(async () => ({ points_restored: 100 })),
  };

  const gateway = {
    emitToJob: jest.fn(),
    emitToUser: jest.fn(),
  };

  const notificationsService = {
    create: jest.fn(async () => ({})),
  };

  const dummy = {} as never;

  const service = new JobsService(
    jobModel as never,
    quoteModel as never,
    dummy, // contractModel
    dummy, // serviceModel
    dummy, // helperModel
    dummy, // penaltyEventModel
    gateway as never,
    notificationsService as never,
    dummy, // chatService
    dummy, // paymentsService
    dummy, // routingService
    dummy, // favoritesService
    vouchersService as never,
    loyaltyService as never,
    dummy, // disputesService
  );

  return { service, jobRecord, vouchersService, loyaltyService, customerId, jobId };
}

describe('JobsService.cancelJob - Khôi phục voucher và điểm loyalty', () => {
  it('hủy đơn thường có voucher + điểm: hoàn đúng 1 lần với đúng (customerId, jobId)', async () => {
    const { service, jobRecord, vouchersService, loyaltyService, customerId, jobId } = makeJobsService();

    const cancelledJob = await service.cancelJob(
      String(customerId),
      'customer',
      String(jobId),
      { reason: 'Thay đổi kế hoạch cá nhân' },
    );

    expect(cancelledJob.status).toBe(JobStatus.CANCELLED);
    expect(jobRecord['benefits_restored_at']).toBeInstanceOf(Date);
    expect(vouchersService.restoreForJob).toHaveBeenCalledTimes(1);
    expect(vouchersService.restoreForJob).toHaveBeenCalledWith(String(customerId), String(jobId));
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledTimes(1);
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledWith(String(customerId), String(jobId));
  });

  it('gọi khôi phục lặp lại: cờ benefits_restored_at đã có -> không hoàn thêm lần 2', async () => {
    const { service, jobRecord, vouchersService, loyaltyService, customerId, jobId } = makeJobsService();

    // Lần 1: hủy đơn
    await service.cancelJob(
      String(customerId),
      'customer',
      String(jobId),
      { reason: 'Bận việc đột xuất' },
    );
    expect(vouchersService.restoreForJob).toHaveBeenCalledTimes(1);
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledTimes(1);

    // Lần 2: gọi lại hàm restoreJobBenefitsOnCancel với cùng job
    await (
      service as unknown as {
        restoreJobBenefitsOnCancel: (j: unknown) => Promise<void>;
      }
    ).restoreJobBenefitsOnCancel(jobRecord);

    // Số lần gọi vẫn là 1, không tăng
    expect(vouchersService.restoreForJob).toHaveBeenCalledTimes(1);
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledTimes(1);
  });

  it('best-effort: nếu trả voucher thất bại, hoàn điểm vẫn chạy và đơn vẫn hủy thành công', async () => {
    const { service, loyaltyService, customerId, jobId } = makeJobsService({ voucherThrows: true });

    const cancelledJob = await service.cancelJob(
      String(customerId),
      'customer',
      String(jobId),
      { reason: 'Không cần nữa' },
    );

    expect(cancelledJob.status).toBe(JobStatus.CANCELLED);
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledTimes(1);
  });
});

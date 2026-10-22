import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';

/**
 * Spec cho SosBackupService.restoreJobBenefitsOnSosCancel — lớp bảo vệ
 * idempotency (cờ job.benefits_restored_at, claim nguyên tử) + best-effort:
 * lỗi ở 1 service khôi phục không chặn service còn lại và không ném ra ngoài.
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

function makeService(opts?: { voucherThrows?: boolean }) {
  const jobRecord: Doc = {
    _id: new Types.ObjectId(),
    customer_id: new Types.ObjectId(),
    benefits_restored_at: undefined,
  };
  const jobModel = {
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => ({
      exec: async () => {
        if (!matches(jobRecord, filter)) return null;
        Object.assign(jobRecord, (update['$set'] as Doc) ?? {});
        return jobRecord;
      },
    }),
  };
  const vouchersService = {
    restoreForJob: jest.fn(async () => {
      if (opts?.voucherThrows) throw new Error('voucher store down');
      return { restored: true, discount_amount: 50_000, code: 'SOS10' };
    }),
  };
  const loyaltyService = {
    reverseRedeemForJob: jest.fn(async () => ({ points_restored: 150 })),
  };

  const dummy = {} as never;
  const service = new SosBackupService(
    dummy, // sosModel
    jobModel as never, // jobModel
    dummy, // contractModel
    dummy, // helperModel
    dummy, // penaltyEventModel
    dummy, // userModel
    dummy, // gateway
    dummy, // chatService
    dummy, // notificationsService
    dummy, // paymentsService
    vouchersService as never,
    loyaltyService as never,
    { get: () => undefined } as never, // configService
  );

  const job = {
    _id: jobRecord._id,
    customer_id: jobRecord.customer_id,
    benefits_restored_at: undefined,
  };
  return { service, job, jobRecord, vouchersService, loyaltyService };
}

describe('SosBackupService.restoreJobBenefitsOnSosCancel', () => {
  it('lần đầu: claim cờ benefits_restored_at và gọi cả 2 service khôi phục đúng (customerId, jobId)', async () => {
    const { service, job, jobRecord, vouchersService, loyaltyService } = makeService();

    await (
      service as unknown as {
        restoreJobBenefitsOnSosCancel: (j: unknown) => Promise<void>;
      }
    ).restoreJobBenefitsOnSosCancel(job);

    expect(jobRecord['benefits_restored_at']).toBeInstanceOf(Date);
    expect(vouchersService.restoreForJob).toHaveBeenCalledTimes(1);
    expect(vouchersService.restoreForJob).toHaveBeenCalledWith(
      String(job.customer_id),
      String(job._id),
    );
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledTimes(1);
  });

  it('lần 2 (retry/replay): cờ đã có → KHÔNG gọi lại service nào, không khôi phục trùng', async () => {
    const { service, job, vouchersService, loyaltyService } = makeService();
    const call = () =>
      (
        service as unknown as {
          restoreJobBenefitsOnSosCancel: (j: unknown) => Promise<void>;
        }
      ).restoreJobBenefitsOnSosCancel(job);

    await call();
    await call();

    expect(vouchersService.restoreForJob).toHaveBeenCalledTimes(1);
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledTimes(1);
  });

  it('best-effort: trả voucher lỗi thì hoàn điểm vẫn chạy và hàm không ném lỗi', async () => {
    const { service, job, loyaltyService } = makeService({ voucherThrows: true });

    await expect(
      (
        service as unknown as {
          restoreJobBenefitsOnSosCancel: (j: unknown) => Promise<void>;
        }
      ).restoreJobBenefitsOnSosCancel(job),
    ).resolves.toBeUndefined();
    expect(loyaltyService.reverseRedeemForJob).toHaveBeenCalledTimes(1);
  });
});

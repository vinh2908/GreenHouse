import { Types } from 'mongoose';
import { VouchersService } from './vouchers.service';

/**
 * Spec cho VouchersService.restoreForJob — trả lượt voucher khi hủy đơn SOS.
 * Dùng model giả in-memory (chỉ hỗ trợ đúng các toán tử mà service dùng).
 */

type Doc = Record<string, unknown>;

const eq = (a: unknown, b: unknown): boolean => {
  if (a instanceof Types.ObjectId || b instanceof Types.ObjectId) {
    return String(a) === String(b);
  }
  return a === b;
};

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or') {
      if (!(cond as Record<string, unknown>[]).some(f => matches(doc, f))) return false;
      continue;
    }
    const val = doc[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Types.ObjectId)) {
      const ops = cond as Record<string, unknown>;
      if ('$gt' in ops && !((val as number) > (ops['$gt'] as number))) return false;
      if ('$ne' in ops && eq(val, ops['$ne'])) return false;
      if ('$in' in ops && !(ops['$in'] as unknown[]).some(v => eq(val, v))) return false;
      if ('$exists' in ops && (val !== undefined) !== Boolean(ops['$exists'])) return false;
      continue;
    }
    if (!eq(val, cond)) return false;
  }
  return true;
}

function applyUpdate(doc: Doc, update: Record<string, unknown>): void {
  for (const [op, fields] of Object.entries(update)) {
    if (op === '$set') Object.assign(doc, fields as Doc);
    if (op === '$inc') {
      for (const [k, v] of Object.entries(fields as Doc)) {
        doc[k] = ((doc[k] as number) ?? 0) + (v as number);
      }
    }
  }
}

const execOf = <T>(value: T) => ({ exec: async () => value });

function makeService() {
  const userId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const voucher: Doc = {
    _id: new Types.ObjectId(),
    code: 'SOS10',
    discount_type: 'fixed',
    discount_value: 50_000,
    min_order_amount: 0,
    per_user_limit: 1,
    used_count: 3,
    is_active: true,
  };
  const redemptions: Doc[] = [
    {
      _id: new Types.ObjectId(),
      voucher_id: voucher._id,
      code: 'SOS10',
      user_id: userId,
      job_id: jobId,
      discount_amount: 50_000,
      status: 'redeemed',
    },
  ];

  const voucherModel = {
    findOne: (filter: Record<string, unknown>) =>
      execOf(matches(voucher, filter) ? voucher : null),
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      if (!matches(voucher, filter)) return execOf(null);
      applyUpdate(voucher, update);
      return execOf(voucher);
    },
  };
  const redemptionModel = {
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      const found = redemptions.find(r => matches(r, filter));
      if (!found) return execOf(null);
      applyUpdate(found, update);
      return execOf(found);
    },
    countDocuments: (filter: Record<string, unknown>) =>
      execOf(redemptions.filter(r => matches(r, filter)).length),
  };

  const service = new VouchersService(
    voucherModel as never,
    redemptionModel as never,
    {} as never,
  );
  return { service, userId, jobId, voucher, redemptions };
}

describe('VouchersService.restoreForJob (hủy đơn theo SOS)', () => {
  it('trả lượt: redemption → reversed, used_count giảm 1, trả đúng số tiền đã giảm', async () => {
    const { service, userId, jobId, voucher, redemptions } = makeService();

    const result = await service.restoreForJob(String(userId), String(jobId));

    expect(result).toEqual({ restored: true, discount_amount: 50_000, code: 'SOS10' });
    expect(redemptions[0]['status']).toBe('reversed');
    expect(voucher['used_count']).toBe(2);
  });

  it('idempotent: gọi lần 2 không trừ used_count thêm, không lỗi', async () => {
    const { service, userId, jobId, voucher } = makeService();

    await service.restoreForJob(String(userId), String(jobId));
    const second = await service.restoreForJob(String(userId), String(jobId));

    expect(second).toEqual({ restored: false, discount_amount: 0 });
    expect(voucher['used_count']).toBe(2);
  });

  it('đơn không dùng voucher → no-op', async () => {
    const { service, userId, voucher } = makeService();

    const result = await service.restoreForJob(String(userId), String(new Types.ObjectId()));

    expect(result.restored).toBe(false);
    expect(voucher['used_count']).toBe(3);
  });

  it('sau khi trả lượt, khách dùng lại được mã (assertUsable không còn tính lượt đã reversed)', async () => {
    const { service, userId, jobId, redemptions } = makeService();

    // per_user_limit = 1 và đã có 1 lượt 'redeemed' → preview bị chặn
    await expect(service.preview('SOS10', String(userId), 200_000)).rejects.toThrow(
      /tối đa số lần/,
    );
    expect(redemptions[0]['status']).toBe('redeemed');

    await service.restoreForJob(String(userId), String(jobId));

    // Lượt đã reversed → không còn bị chặn, tính giảm bình thường
    const preview = await service.preview('SOS10', String(userId), 200_000);
    expect(preview.discount_amount).toBe(50_000);
  });
});

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

function applyUpdate(doc: Doc, update: any): void {
  if (Array.isArray(update)) {
    for (const stage of update) {
      if (stage.$set) {
        for (const [k, v] of Object.entries(stage.$set)) {
          if (k === 'used_count') {
            doc.used_count = Math.max(0, ((doc.used_count as number) ?? 0) - 1);
          } else if (k === 'used_user_ids') {
            const arr = Array.isArray(doc.used_user_ids) ? [...doc.used_user_ids] : [];
            const targetId =
              (v as any)?.$let?.vars?.idxObj?.$indexOfArray?.[1] ??
              (v as any)?.$let?.vars?.idxStr?.$indexOfArray?.[1];
            const idx = arr.findIndex(id => eq(id, targetId) || String(id) === String(targetId));
            if (idx >= 0) {
              arr.splice(idx, 1);
            }
            doc.used_user_ids = arr;
          } else {
            doc[k] = v;
          }
        }
      }
    }
    return;
  }
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
    findById: (id: unknown) => execOf(matches(voucher, { _id: id }) ? voucher : null),
    findOne: (filter: Record<string, unknown>) => execOf(matches(voucher, filter) ? voucher : null),
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
    {} as never,
  ); // B99: NotificationsService
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

  describe('N1: Atomic aggregation-pipeline restore & edge cases', () => {
    it('(a) atomic restore: chỉ bỏ đúng 1 entry userId trong used_user_ids, không làm mất entry của user khác hoặc entry còn lại', async () => {
      const { service, userId, jobId, voucher, redemptions } = makeService();
      const user2 = new Types.ObjectId();
      // Giả sử mảng used_user_ids có 2 entry của userId và 1 entry của user2
      voucher['used_user_ids'] = [userId, user2, userId];
      voucher['used_count'] = 3;

      const result = await service.restoreForJob(String(userId), String(jobId));
      expect(result.restored).toBe(true);

      // Đúng 1 entry của userId bị bỏ, còn lại [user2, userId] (hoặc giữ nguyên entry user2 và 1 entry userId)
      const user1Count = (voucher['used_user_ids'] as any[]).filter(id => eq(id, userId)).length;
      const user2Count = (voucher['used_user_ids'] as any[]).filter(id => eq(id, user2)).length;
      expect(user1Count).toBe(1);
      expect(user2Count).toBe(1);
      expect(voucher['used_count']).toBe(2);
    });

    it('(b) redemption đã flip reversed nhưng findById trả null → used_count vẫn giảm đúng nguyên tử', async () => {
      const { service, userId, jobId, voucher, redemptions } = makeService();
      // findById cố ý trả null (mô phỏng edge case)
      (service as any).voucherModel.findById = jest.fn().mockReturnValue(execOf(null));
      voucher['used_count'] = 5;

      const result = await service.restoreForJob(String(userId), String(jobId));
      expect(result.restored).toBe(true);
      // Code cũ phụ thuộc findById != null sẽ skip giảm used_count (used_count vẫn là 5).
      // Code mới cập nhật nguyên tử qua updatePipeline không phụ thuộc findById → used_count giảm thành 4!
      expect(voucher['used_count']).toBe(4);
    });
  });
});

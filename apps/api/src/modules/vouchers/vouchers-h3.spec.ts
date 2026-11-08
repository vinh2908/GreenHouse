import { Types } from 'mongoose';
import { VouchersService } from './vouchers.service';

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
    if (key === '$and') {
      if (!(cond as Record<string, unknown>[]).every(f => matches(doc, f))) return false;
      continue;
    }
    if (key === '$expr') {
      // Simulate $expr with $lt and $size filter
      const expr = cond as Record<string, unknown>;
      if ('$lt' in expr) {
        const [left, right] = expr['$lt'] as [unknown, unknown];
        let leftVal = 0;
        let rightVal = typeof right === 'number' ? right : 0;
        if (typeof left === 'object' && left !== null && '$size' in left) {
          const sizeExpr = (left as Record<string, unknown>)['$size'] as Record<string, unknown>;
          if ('$filter' in sizeExpr) {
            const filterExpr = sizeExpr['$filter'] as Record<string, unknown>;
            const arr = (doc['used_user_ids'] as Types.ObjectId[]) || [];
            const targetId = (
              (filterExpr['cond'] as Record<string, unknown>)['$eq'] as [unknown, unknown]
            )[1];
            leftVal = arr.filter(id => eq(id, targetId)).length;
          }
        }
        if (!(leftVal < rightVal)) return false;
      }
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
    if (op === '$push') {
      for (const [k, v] of Object.entries(fields as Doc)) {
        if (!Array.isArray(doc[k])) doc[k] = [];
        (doc[k] as unknown[]).push(v);
      }
    }
  }
}

const execOf = <T>(value: T) => ({ exec: async () => value });

describe('H3: Voucher atomic limit under concurrency', () => {
  it('3 concurrent redemptions at limit 2 -> exactly 2 succeed, 1 blocked, used_count = 2', async () => {
    const userId = new Types.ObjectId();
    const voucher: Doc = {
      _id: new Types.ObjectId(),
      code: 'LIMIT2',
      discount_type: 'fixed',
      discount_value: 20_000,
      min_order_amount: 0,
      per_user_limit: 2,
      used_count: 0,
      used_user_ids: [],
      is_active: true,
    };
    const redemptions: Doc[] = [];

    const voucherModel = {
      findOne: (filter: Record<string, unknown>) =>
        execOf(matches(voucher, filter) ? voucher : null),
      findById: () => execOf(voucher),
      findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        if (!matches(voucher, filter)) return execOf(null);
        applyUpdate(voucher, update);
        return execOf(voucher);
      },
    };

    const redemptionModel = {
      create: async (docs: Doc[]) => {
        redemptions.push(...docs);
        return docs;
      },
      countDocuments: (filter: Record<string, unknown>) =>
        execOf(redemptions.filter(r => matches(r, filter)).length),
    };

    const service = new VouchersService(
      voucherModel as never,
      redemptionModel as never,
      {} as never,
      {} as never,
    );

    const call1 = service.redeemForJob(
      String(userId),
      String(new Types.ObjectId()),
      'LIMIT2',
      100_000,
    );
    const call2 = service.redeemForJob(
      String(userId),
      String(new Types.ObjectId()),
      'LIMIT2',
      100_000,
    );
    const call3 = service.redeemForJob(
      String(userId),
      String(new Types.ObjectId()),
      'LIMIT2',
      100_000,
    );

    const results = await Promise.allSettled([call1, call2, call3]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(1);
    expect(voucher['used_count']).toBe(2);
    expect(redemptions.length).toBe(2);
  });

  it('K10: đổi ×2 → hoàn ×1 → assert count = 1 và lần đổi thứ 3 bị chặn ở giới hạn', async () => {
    const userId = new Types.ObjectId();
    const job1Id = new Types.ObjectId();
    const job2Id = new Types.ObjectId();
    const job3Id = new Types.ObjectId();
    const job4Id = new Types.ObjectId();

    const voucher: Doc = {
      _id: new Types.ObjectId(),
      code: 'LIMIT2K10',
      discount_type: 'fixed',
      discount_value: 20_000,
      min_order_amount: 0,
      per_user_limit: 2,
      used_count: 0,
      used_user_ids: [],
      is_active: true,
    };
    const redemptions: Doc[] = [];

    const voucherModel = {
      findOne: (filter: Record<string, unknown>) =>
        execOf(matches(voucher, filter) ? voucher : null),
      findById: (id?: unknown) => execOf(voucher),
      findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        if (!matches(voucher, filter)) return execOf(null);
        applyUpdate(voucher, update);
        return execOf(voucher);
      },
    };

    const redemptionModel = {
      create: async (docs: Doc[]) => {
        redemptions.push(...docs);
        return docs;
      },
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
    );

    // 1. Đổi lần 1 -> Thành công
    await service.redeemForJob(String(userId), String(job1Id), 'LIMIT2K10', 100_000);
    // 2. Đổi lần 2 -> Thành công (đã chạm limit = 2)
    await service.redeemForJob(String(userId), String(job2Id), 'LIMIT2K10', 100_000);

    const userCountAfter2 = ((voucher['used_user_ids'] as Types.ObjectId[]) || []).filter(id =>
      eq(id, userId),
    ).length;
    expect(userCountAfter2).toBe(2);
    expect(voucher['used_count']).toBe(2);

    // 3. Hoàn đơn 1 (restoreForJob) -> CHỈ xóa 1 entry của userId, used_user_ids còn đúng 1
    const restoreRes = await service.restoreForJob(String(userId), String(job1Id));
    expect(restoreRes.restored).toBe(true);

    const userCountAfterRestore = ((voucher['used_user_ids'] as Types.ObjectId[]) || []).filter(
      id => eq(id, userId),
    ).length;
    // BẮT BUỘC: count = 1 (không bị rơi về 0 như khi dùng $pull)
    expect(userCountAfterRestore).toBe(1);
    expect(voucher['used_count']).toBe(1);

    // 4. Đổi lại lần nữa (lần thứ 3 trong lịch sử, hiện tại count = 1 < 2) -> Thành công
    await service.redeemForJob(String(userId), String(job3Id), 'LIMIT2K10', 100_000);
    const userCountAfter3 = ((voucher['used_user_ids'] as Types.ObjectId[]) || []).filter(id =>
      eq(id, userId),
    ).length;
    expect(userCountAfter3).toBe(2);

    // 5. Đổi lần thứ 4 (hiện tại count = 2 >= 2) -> BỊ CHẶN ở giới hạn!
    await expect(
      service.redeemForJob(String(userId), String(job4Id), 'LIMIT2K10', 100_000),
    ).rejects.toThrow('Bạn đã dùng mã này tối đa số lần cho phép');
  });
});

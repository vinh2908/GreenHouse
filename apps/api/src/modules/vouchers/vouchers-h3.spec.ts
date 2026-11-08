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
});

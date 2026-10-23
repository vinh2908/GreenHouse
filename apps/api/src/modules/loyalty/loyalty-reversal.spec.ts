import { Types } from 'mongoose';
import { LoyaltyService } from './loyalty.service';

/**
 * Spec cho LoyaltyService.reverseRedeemForJob — hoàn điểm khi hủy đơn SOS.
 * Model giả in-memory; sổ cái KHÔNG được sửa giao dịch gốc, chỉ ghi 'reversal'.
 */

type Doc = Record<string, unknown>;

const eq = (a: unknown, b: unknown): boolean =>
  a instanceof Types.ObjectId || b instanceof Types.ObjectId ? String(a) === String(b) : a === b;

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    const val = doc[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Types.ObjectId)) {
      const ops = cond as Record<string, unknown>;
      if ('$gte' in ops && !((val as number) >= (ops['$gte'] as number))) return false;
      continue;
    }
    if (!eq(val, cond)) return false;
  }
  return true;
}

const execOf = <T>(value: T) => ({ exec: async () => value });

function makeService(withRedeem: boolean) {
  const userId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const account: Doc = {
    user_id: userId,
    points_balance: 350,
    lifetime_points: 1_000,
  };
  const txs: Doc[] = withRedeem
    ? [
        {
          _id: new Types.ObjectId(),
          user_id: userId,
          type: 'redeem',
          points: -150,
          job_id: jobId,
          balance_after: 350,
          note: 'Đổi điểm cho đơn',
        },
      ]
    : [];

  const accountModel = {
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => {
      if (!matches(account, filter)) {
        if (options?.['upsert']) {
          Object.assign(account, (update['$setOnInsert'] as Doc) ?? {});
          return execOf(account);
        }
        return execOf(null);
      }
      const inc = (update['$inc'] as Doc) ?? {};
      for (const [k, v] of Object.entries(inc)) {
        account[k] = ((account[k] as number) ?? 0) + (v as number);
      }
      return execOf(account);
    },
  };
  const txModel = {
    findOne: (filter: Record<string, unknown>) => execOf(txs.find(t => matches(t, filter)) ?? null),
    create: async (doc: Doc) => {
      const created = { _id: new Types.ObjectId(), ...doc };
      txs.push(created);
      return created;
    },
  };

  const service = new LoyaltyService(
    accountModel as never,
    txModel as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
  );
  return { service, userId, jobId, account, txs };
}

describe('LoyaltyService.reverseRedeemForJob (hủy đơn theo SOS)', () => {
  it('hoàn đúng số điểm đã trừ bằng giao dịch reversal mới, không sửa giao dịch redeem gốc', async () => {
    const { service, userId, jobId, account, txs } = makeService(true);

    const result = await service.reverseRedeemForJob(String(userId), String(jobId));

    expect(result).toEqual({ points_restored: 150 });
    expect(account['points_balance']).toBe(500);
    // lifetime không đổi: redeem không trừ lifetime nên reversal cũng không cộng
    expect(account['lifetime_points']).toBe(1_000);

    const reversal = txs.find(t => t['type'] === 'reversal');
    expect(reversal).toBeDefined();
    expect(reversal!['points']).toBe(150);
    expect(String(reversal!['job_id'])).toBe(String(jobId));
    expect(reversal!['balance_after']).toBe(500);

    const redeem = txs.find(t => t['type'] === 'redeem');
    expect(redeem!['points']).toBe(-150); // lịch sử nguyên vẹn
  });

  it('idempotent: gọi lần 2 không cộng điểm thêm, không tạo reversal thứ 2', async () => {
    const { service, userId, jobId, account, txs } = makeService(true);

    await service.reverseRedeemForJob(String(userId), String(jobId));
    const second = await service.reverseRedeemForJob(String(userId), String(jobId));

    expect(second).toEqual({ points_restored: 150 });
    expect(account['points_balance']).toBe(500);
    expect(txs.filter(t => t['type'] === 'reversal')).toHaveLength(1);
  });

  it('đơn không dùng điểm → null, không đổi số dư, không ghi giao dịch', async () => {
    const { service, userId, jobId, account, txs } = makeService(false);

    const result = await service.reverseRedeemForJob(String(userId), String(jobId));

    expect(result).toBeNull();
    expect(account['points_balance']).toBe(350);
    expect(txs).toHaveLength(0);
  });
});

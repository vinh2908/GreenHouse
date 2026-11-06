import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LoyaltyService } from './loyalty.service';

/** Spec B48: thu hồi điểm thưởng không làm số dư âm. */
describe('LoyaltyService.revokePoints (B48)', () => {
  function makeService(balance: number) {
    const userId = new Types.ObjectId();
    const account: Record<string, unknown> = {
      user_id: userId,
      points_balance: balance,
      lifetime_points: 100,
    };
    const txs: Record<string, unknown>[] = [];
    const accountModel: any = {
      findOneAndUpdate: (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => ({
        exec: async () => {
          if (options?.['upsert']) return account;
          const cond = filter['points_balance'] as Record<string, unknown> | undefined;
          if (
            cond &&
            '$gte' in cond &&
            (account['points_balance'] as number) < (cond['$gte'] as number)
          ) {
            return null;
          }
          const inc = (update['$inc'] as Record<string, unknown>) ?? {};
          for (const [k, v] of Object.entries(inc)) {
            account[k] = ((account[k] as number) ?? 0) + (v as number);
          }
          return account;
        },
      }),
    };
    const txModel: any = {
      create: async (doc: Record<string, unknown>) => {
        const created = { _id: new Types.ObjectId(), ...doc };
        txs.push(created);
        return created;
      },
    };
    const service = new LoyaltyService(
      accountModel,
      txModel,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
    );
    return { service, userId, account, txs };
  }

  it('khách có 50 điểm → thu hồi 100 điểm → số dư về 0, không âm; log "thu hồi 50/100 điểm"', async () => {
    const { service, userId, account, txs } = makeService(50);
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    const result = await service.revokePoints(String(userId), 100);

    expect(result).toEqual({ points_revoked: 50, points_requested: 100, balance_after: 0 });
    expect(account['points_balance']).toBe(0);
    expect(txs).toHaveLength(1);
    expect(txs[0]['type']).toBe('revoke');
    expect(txs[0]['points']).toBe(-50);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('50/100'));
    warnSpy.mockRestore();
  });

  it('thu hồi đủ điểm → trừ đúng số, số dư còn lại', async () => {
    const { service, userId, account, txs } = makeService(200);
    const result = await service.revokePoints(String(userId), 100);
    expect(result).toEqual({ points_revoked: 100, points_requested: 100, balance_after: 100 });
    expect(account['points_balance']).toBe(100);
    expect(txs[0]['points']).toBe(-100);
  });

  it('số dư 0 → thu hồi 0 điểm, không ghi giao dịch, không âm', async () => {
    const { service, userId, account, txs } = makeService(0);
    const result = await service.revokePoints(String(userId), 100);
    expect(result.points_revoked).toBe(0);
    expect(account['points_balance']).toBe(0);
    expect(txs).toHaveLength(0);
  });

  it('số điểm thu hồi <= 0 → 400', async () => {
    const { service, userId } = makeService(50);
    await expect(service.revokePoints(String(userId), 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.revokePoints(String(userId), -10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

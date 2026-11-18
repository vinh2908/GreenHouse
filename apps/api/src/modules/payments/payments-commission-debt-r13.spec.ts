import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';
import { computeCommissionDebtFromTransactions } from './commission-debt-backfill';

/**
 * R13-N1 — cash-commission debt ledger.
 *
 * Before: deductCommissionForCashJob clamped the deduction to the wallet
 * balance and recorded the shortfall only as metadata.unpaid_fee on the
 * commission tx — write-only, never read, so the fee was silently lost
 * (wallet 0₫ + fee 50.000₫ → deducted 0, debt 0).
 *
 * After: the shortfall is recorded as Wallet.commission_debt in the SAME
 * atomic $inc as the deduction, and it is repaid from later REAL earnings
 * (creditHelper / creditWallet) and settled first at withdrawal.
 * Simulated money never repays real debt.
 *
 * FAILS on base d06aa9c: Wallet has no commission_debt field and the
 * service never records or repays a shortfall (debt stays 0/absent).
 */
describe('PaymentsService — R13-N1 commission debt', () => {
  const helperId = new Types.ObjectId().toHexString();
  const jobId = new Types.ObjectId().toHexString();

  function makeService(balance = 0, initialDebt = 0, opts: { failTxCreate?: boolean } = {}) {
    let currentBalance = balance;
    let currentDebt = initialDebt;
    let currentSimulated = 0;
    const walletId = new Types.ObjectId();
    const applyWalletUpdate = (filter: any, update: any) => ({
      exec: jest.fn(async () => {
        if (update?.$setOnInsert) {
          return {
            _id: walletId,
            balance: currentBalance,
            commission_debt: currentDebt,
            simulated_balance: currentSimulated,
          };
        }
        if (filter?.balance?.$gte !== undefined && currentBalance < filter.balance.$gte) {
          return null;
        }
        if (filter?.commission_debt?.$gte !== undefined && currentDebt < filter.commission_debt.$gte) {
          return null;
        }
        if (update?.$inc?.balance !== undefined) currentBalance += update.$inc.balance;
        if (update?.$inc?.commission_debt !== undefined) currentDebt += update.$inc.commission_debt;
        if (update?.$inc?.simulated_balance !== undefined) {
          currentSimulated += update.$inc.simulated_balance;
        }
        return {
          _id: walletId,
          balance: currentBalance,
          commission_debt: currentDebt,
          simulated_balance: currentSimulated,
        };
      }),
    });
    const walletModel: any = {
      findOneAndUpdate: jest.fn(applyWalletUpdate),
      findByIdAndUpdate: jest.fn((_id: any, update: any, _options: any) =>
        applyWalletUpdate({}, update),
      ),
      updateOne: jest.fn((filter: any, update: any) => applyWalletUpdate(filter, update)),
    };
    const createdTx: any[] = [];
    const transactionModel: any = {
      create: jest.fn(async (doc: any) => {
        if (opts.failTxCreate) throw new Error('tx boom');
        const txs = (Array.isArray(doc) ? doc : [doc]).map((d: any) => ({
          _id: new Types.ObjectId(),
          ...d,
        }));
        createdTx.push(...txs);
        return txs;
      }),
    };
    const withdrawalModel: any = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest.fn(async (doc: any) => ({ _id: new Types.ObjectId(), ...doc })),
      deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const helperModel: any = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          bank_account: { bank_name: 'VCB', account_number: '123456', account_name: 'NGUYEN VAN A' },
        }),
      }),
    };
    const service = new PaymentsService(
      walletModel,
      transactionModel,
      withdrawalModel,
      helperModel,
      { create: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
    );
    return {
      service,
      createdTx,
      state: () => ({ balance: currentBalance, debt: currentDebt, simulated: currentSimulated }),
    };
  }

  it('creditHelper repays the full debt from a larger earning', async () => {
    const { service, createdTx, state } = makeService(0, 20_000);
    const tx: any = await service.creditHelper(helperId, jobId, 100_000);
    expect(tx.amount).toBe(100_000);
    expect(tx.description).toContain('đã trừ 20.000₫ phí sàn tiền mặt còn nợ');
    expect(tx.metadata.debt_repaid).toBe(20_000);
    expect(tx.metadata.debt_remaining).toBe(0);
    expect(state()).toEqual({ balance: 80_000, debt: 0, simulated: 0 });
    expect(createdTx[0].balance_after).toBe(80_000);
  });

  it('creditHelper partially repays when the earning is smaller than the debt', async () => {
    const { service, state } = makeService(0, 20_000);
    const tx: any = await service.creditHelper(helperId, jobId, 10_000);
    expect(tx.metadata.debt_repaid).toBe(10_000);
    expect(tx.metadata.debt_remaining).toBe(10_000);
    expect(state()).toEqual({ balance: 0, debt: 10_000, simulated: 0 });
  });

  it('creditHelper with no debt credits in full and writes no debt fields', async () => {
    const { service, state } = makeService(0, 0);
    const tx: any = await service.creditHelper(helperId, jobId, 100_000);
    expect(tx.amount).toBe(100_000);
    expect(tx.metadata).toBeUndefined();
    expect(tx.description).not.toContain('đã trừ');
    expect(state()).toEqual({ balance: 100_000, debt: 0, simulated: 0 });
  });

  it('creditWallet (monthly settle path) repays debt from real earnings', async () => {
    const { service, state } = makeService(0, 20_000);
    const tx: any = await service.creditWallet(helperId, 100_000, {
      description: 'Lương tháng 11',
      reference: 'SETTLE-1',
    });
    expect(tx.metadata.debt_repaid).toBe(20_000);
    expect(state()).toEqual({ balance: 80_000, debt: 0, simulated: 0 });
  });

  it('creditWallet with skipDebtRepayment restores in full (rollback path)', async () => {
    const { service, state } = makeService(0, 20_000);
    await service.creditWallet(helperId, 50_000, {
      description: 'Hoàn phí sàn do lỗi nghiệm thu',
      reference: 'ROLLBACK-COMMISSION-x',
      type: 'refund',
      skipDebtRepayment: true,
    });
    expect(state()).toEqual({ balance: 50_000, debt: 20_000, simulated: 0 });
  });

  it('creditHelperSimulated never touches real debt', async () => {
    const { service, state } = makeService(0, 20_000);
    await service.creditHelperSimulated(helperId, jobId, 500_000);
    expect(state()).toEqual({ balance: 0, debt: 20_000, simulated: 500_000 });
  });

  it('withdrawal settles the debt first, then pays the remainder', async () => {
    const { service, createdTx, state } = makeService(100_000, 20_000);
    const w: any = await service.requestWithdrawal(helperId, 80_000);
    expect(w.status).toBe('pending');
    expect(w.amount).toBe(80_000);
    expect(state()).toEqual({ balance: 0, debt: 0, simulated: 0 });
    const tx = createdTx[0];
    expect(tx.type).toBe('withdrawal');
    expect(tx.balance_before).toBe(100_000);
    expect(tx.balance_after).toBe(0);
    expect(tx.metadata.debt_settled).toBe(20_000);
    expect(tx.description).toContain('đã trừ 20.000₫ phí sàn tiền mặt còn nợ');
  });

  it('withdrawal above balance − debt is rejected with the max payout and the debt', async () => {
    const { service, state } = makeService(100_000, 20_000);
    await expect(service.requestWithdrawal(helperId, 90_000)).rejects.toThrow(
      /tối đa là 80\.000₫.*nợ 20\.000₫/,
    );
    expect(state()).toEqual({ balance: 100_000, debt: 20_000, simulated: 0 });
  });

  it('withdrawal is impossible when the debt eats the whole balance', async () => {
    const { service, state } = makeService(10_000, 20_000);
    await expect(service.requestWithdrawal(helperId, 50_000)).rejects.toThrow(
      /tối đa là 0₫/,
    );
    expect(state()).toEqual({ balance: 10_000, debt: 20_000, simulated: 0 });
  });

  it('failed withdrawal restores both balance and debt', async () => {
    const { service, state } = makeService(100_000, 20_000, { failTxCreate: true });
    await expect(service.requestWithdrawal(helperId, 80_000)).rejects.toThrow('tx boom');
    expect(state()).toEqual({ balance: 100_000, debt: 20_000, simulated: 0 });
  });
});

describe('R13-N1: commission-debt backfill aggregation (pure)', () => {
  it('sums unpaid fees per helper, minus repayments and withdrawal settlements', () => {
    const out = computeCommissionDebtFromTransactions([
      { user_id: 'A', type: 'commission', metadata: { unpaid_fee: 20_000 } },
      { user_id: 'A', type: 'commission', metadata: { unpaid_fee: 50_000 } },
      { user_id: 'A', type: 'earning', metadata: { debt_repaid: 20_000 } },
      { user_id: 'A', type: 'withdrawal', metadata: { debt_settled: 10_000 } },
      { user_id: 'B', type: 'commission', metadata: { unpaid_fee: 0 } },
      { user_id: 'C', type: 'earning', metadata: { debt_repaid: 5_000 } },
    ]);
    expect(out).toEqual({ A: 40_000 });
  });

  it('floors at zero and ignores txs without debt metadata', () => {
    const out = computeCommissionDebtFromTransactions([
      { user_id: 'A', type: 'commission', metadata: { unpaid_fee: 10_000 } },
      { user_id: 'A', type: 'earning', metadata: { debt_repaid: 30_000 } },
      { user_id: 'B', type: 'payment', metadata: {} },
      { user_id: 'C', type: 'commission', metadata: null },
    ]);
    expect(out).toEqual({});
  });
});

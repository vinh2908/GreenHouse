import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { Wallet, Transaction, Withdrawal } from './schemas/payment.schema';
import { HelperProfile } from '../helpers/schemas/helper-profile.schema';
import { Job, Contract } from '../jobs/schemas/job.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { Types } from 'mongoose';

/**
 * Spec H5 (G2 phần sót): deductCommissionForCashJob nguyên tử.
 * - $inc có guard $gte trên số tiền trừ THỰC TẾ, balance_after lấy TỪ KẾT
 *   QUẢ $inc (new: true), session truyền xuống cả $inc lẫn ghi giao dịch.
 * - Ví không đủ phí thì chỉ trừ tối đa số dư, phần thiếu ghi unpaid_fee
 *   (giữ logic cũ — xem B43), KHÔNG ném lỗi, KHÔNG để ví âm.
 * - 2 lần trừ song song không làm ví âm và không trừ trùng: tổng số trừ
 *   không vượt số dư ban đầu; lần trừ chen ngang bị guard chặn (trả null)
 *   thì đọc lại số dư và thử lại với số tiền trừ đã cập nhật.
 */
describe('PaymentsService - H5 atomic deductCommissionForCashJob', () => {
  let service: PaymentsService;
  let walletModel: any;
  let transactionModel: any;
  let createdTxs: any[];
  // Mô phỏng số dư ví trong bộ nhớ: $inc áp dụng nguyên tử lên biến này.
  let balance: number;

  function buildService(initialBalance: number) {
    balance = initialBalance;
    createdTxs = [];
    const walletId = new Types.ObjectId();

    const applyWalletUpdate = (filter: any, update: any) => ({
      exec: jest.fn(async () => {
        // getOrCreateWallet: upsert, chỉ đọc số dư hiện tại.
        if (update.$setOnInsert) {
          return { _id: walletId, balance };
        }
        // Guard $gte — không đủ số dư cho số tiền trừ này thì không trừ, trả null.
        if (filter?.balance?.$gte !== undefined && balance < filter.balance.$gte) {
          return null;
        }
        if (update.$inc?.balance !== undefined) {
          balance += update.$inc.balance;
        }
        return { _id: walletId, balance };
      }),
    });

    walletModel = {
      findOneAndUpdate: jest.fn(applyWalletUpdate),
      findByIdAndUpdate: jest.fn((_id: any, update: any, _options: any) =>
        applyWalletUpdate({}, update),
      ),
    };

    transactionModel = {
      create: jest.fn(async (docs: any) => {
        const items = Array.isArray(docs) ? docs : [docs];
        const created = items.map((d: any) => ({ ...d, _id: new Types.ObjectId() }));
        createdTxs.push(...created);
        return created;
      }),
    };

    return { walletId };
  }

  async function initService(initialBalance: number) {
    buildService(initialBalance);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(Wallet.name), useValue: walletModel },
        { provide: getModelToken(Transaction.name), useValue: transactionModel },
        { provide: getModelToken(Withdrawal.name), useValue: {} },
        { provide: getModelToken(HelperProfile.name), useValue: {} },
        { provide: getModelToken(Job.name), useValue: {} },
        { provide: getModelToken(Contract.name), useValue: {} },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: VouchersService, useValue: {} },
        { provide: LoyaltyService, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  }

  it('trừ đủ phí: $inc có guard $gte, balance_after từ kết quả $inc, session truyền xuống', async () => {
    await initService(100_000);
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();
    const mockSession: any = { id: 'sess-h5' };

    const tx: any = await service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000, mockSession);

    expect(tx.type).toBe('commission');
    expect(tx.amount).toBe(50_000);
    expect(tx.balance_before).toBe(100_000);
    expect(tx.balance_after).toBe(50_000);
    expect(tx.metadata.unpaid_fee).toBe(0);
    expect(tx.metadata.helper_net_earned).toBe(450_000);
    expect(balance).toBe(50_000);
    expect(walletModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ balance: { $gte: 50_000 } }),
      { $inc: { balance: -50_000, total_earned: 450_000 } },
      expect.objectContaining({ new: true, session: mockSession }),
    );
    expect(transactionModel.create).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'commission', amount: 50_000 })]),
      expect.objectContaining({ session: mockSession }),
    );
  });

  it('ví không đủ phí: chỉ trừ tối đa số dư, phần thiếu ghi unpaid_fee, ví không âm', async () => {
    await initService(30_000);
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const tx: any = await service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000);

    expect(tx.amount).toBe(50_000);
    expect(tx.balance_before).toBe(30_000);
    expect(tx.balance_after).toBe(0);
    expect(tx.metadata.unpaid_fee).toBe(20_000);
    expect(balance).toBe(0);
  });

  it('ví 0đ: không trừ, unpaid_fee = toàn bộ phí, balance_after 0', async () => {
    await initService(0);
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const tx: any = await service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000);

    expect(tx.balance_before).toBe(0);
    expect(tx.balance_after).toBe(0);
    expect(tx.metadata.unpaid_fee).toBe(50_000);
    expect(balance).toBe(0);
  });

  it('2 lần trừ song song, tổng phí vượt số dư: ví không âm, tổng trừ = đúng số dư, không trừ trùng', async () => {
    await initService(60_000);
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const [tx1, tx2]: any[] = await Promise.all([
      service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000),
      service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000),
    ]);

    // Ví không âm, tổng trừ đúng 60.000₫ = số dư ban đầu (không trừ trùng 100.000₫).
    expect(balance).toBe(0);
    expect(tx1.balance_after).toBeGreaterThanOrEqual(0);
    expect(tx2.balance_after).toBeGreaterThanOrEqual(0);
    const totalDeducted =
      (tx1.balance_before - tx1.balance_after) + (tx2.balance_before - tx2.balance_after);
    expect(totalDeducted).toBe(60_000);
    // Tổng unpaid_fee = 2 × 50.000 − 60.000 = 40.000 (1 lần đủ phí, 1 lần trừ 1 phần).
    expect(tx1.metadata.unpaid_fee + tx2.metadata.unpaid_fee).toBe(40_000);
    expect([tx1.metadata.unpaid_fee, tx2.metadata.unpaid_fee].sort((a, b) => a - b)).toEqual([
      0, 40_000,
    ]);
    expect(createdTxs).toHaveLength(2);
  });

  it('2 lần trừ song song, đủ số dư cho cả 2: mỗi lần trừ đúng 50k, balance_after nối tiếp nhau', async () => {
    await initService(200_000);
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const [tx1, tx2]: any[] = await Promise.all([
      service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000),
      service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000),
    ]);

    expect(balance).toBe(100_000);
    expect([tx1.balance_after, tx2.balance_after].sort((a, b) => a - b)).toEqual([
      100_000, 150_000,
    ]);
    // Mỗi giao dịch: balance_before = balance_after + 50.000 (khớp $inc, không đọc trước rồi trừ tay).
    for (const tx of [tx1, tx2]) {
      expect(tx.balance_before - tx.balance_after).toBe(50_000);
      expect(tx.metadata.unpaid_fee).toBe(0);
    }
  });

  it('phí 0đ: không đổi số dư, vẫn ghi giao dịch commission', async () => {
    await initService(100_000);
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    const tx: any = await service.deductCommissionForCashJob(helperId, jobId, 0, 450_000);

    expect(tx.balance_before).toBe(100_000);
    expect(tx.balance_after).toBe(100_000);
    expect(tx.metadata.unpaid_fee).toBe(0);
    expect(balance).toBe(100_000);
  });
});

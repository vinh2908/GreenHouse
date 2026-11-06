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
 * Spec G2: creditHelper / deductWallet nguyên tử.
 * - balance_after lấy TỪ KẾT QUẢ $inc (new: true), không đọc trước rồi cộng
 *   tay — 2 lần trả tiền song song không ghi sai balance_after.
 * - deductWallet có guard $gte: số dư không đủ thì ném lỗi, không để ví âm
 *   trong khi giao dịch ghi balance_after = 0.
 * - session (khi có) được truyền xuống cả $inc lẫn ghi giao dịch.
 */
describe('PaymentsService - G2 atomic credit/deduct', () => {
  let service: PaymentsService;
  let walletModel: any;
  let transactionModel: any;
  let createdTxs: any[];
  // Mô phỏng số dư ví trong bộ nhớ: $inc áp dụng nguyên tử lên biến này.
  let balance: number;

  beforeEach(async () => {
    balance = 100000;
    createdTxs = [];
    const walletId = new Types.ObjectId();

    const applyWalletUpdate = (filter: any, update: any) => ({
      exec: jest.fn(async () => {
        // getOrCreateWallet: upsert, chỉ đọc số dư hiện tại.
        if (update.$setOnInsert) {
          return { _id: walletId, balance };
        }
        // deductWallet: guard $gte — không đủ thì không trừ, trả null.
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
  });

  it('creditHelper: balance_after lấy từ kết quả $inc, session được truyền xuống', async () => {
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();
    const mockSession: any = { id: 'sess-1' };

    const tx = await service.creditHelper(helperId, jobId, 50000, mockSession);

    expect(tx.balance_before).toBe(100000);
    expect(tx.balance_after).toBe(150000);
    expect(balance).toBe(150000);
    // $inc được gọi với session.
    expect(walletModel.findByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $inc: { balance: 50000, total_earned: 50000 } },
      expect.objectContaining({ new: true, session: mockSession }),
    );
    // Ghi giao dịch cũng trong session.
    expect(transactionModel.create).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'earning', amount: 50000 })]),
      expect.objectContaining({ session: mockSession }),
    );
  });

  it('creditHelper: 2 lần trả song song (mô phỏng) không sai balance_after', async () => {
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    // Lần 1: 100k → 150k; lần 2: 150k → 200k. Nếu code đọc trước rồi cộng
    // tay (balance_before=100k cả 2 lần) thì lần 2 sẽ ghi sai 150k.
    const tx1 = await service.creditHelper(helperId, jobId, 50000);
    const tx2 = await service.creditHelper(helperId, jobId, 50000);

    expect(tx1.balance_before).toBe(100000);
    expect(tx1.balance_after).toBe(150000);
    expect(tx2.balance_before).toBe(150000);
    expect(tx2.balance_after).toBe(200000);
    expect(balance).toBe(200000);
  });

  it('deductWallet: trừ đúng số dư, guard $gte trong filter, balance_after từ $inc', async () => {
    const userId = new Types.ObjectId().toString();

    const tx = await service.deductWallet(userId, 30000, 'Hoàn tác tiền công');

    expect(tx.balance_before).toBe(100000);
    expect(tx.balance_after).toBe(70000);
    expect(balance).toBe(70000);
    expect(walletModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ balance: { $gte: 30000 } }),
      { $inc: { balance: -30000 } },
      expect.objectContaining({ new: true }),
    );
  });

  it('deductWallet: số dư không đủ → 400, ví không đổi, không ghi giao dịch', async () => {
    const userId = new Types.ObjectId().toString();

    await expect(service.deductWallet(userId, 150000, 'Hoàn tác tiền công')).rejects.toThrow(
      'Số dư không đủ',
    );
    expect(balance).toBe(100000);
    expect(transactionModel.create).not.toHaveBeenCalled();
  });
});

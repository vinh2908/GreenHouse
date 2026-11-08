import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';

describe('I2: deductCashCommission idempotency claim guard', () => {
  it('giả lập lần trừ đầu chậm hơn 500ms (giao dịch chưa hiện sau thời gian đợi) -> lần trừ thứ hai bị chặn bằng ConflictException, phí chỉ trừ 1 lần', async () => {
    const helperId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();
    const walletId = new Types.ObjectId();

    let balance = 100_000;
    const createdTransactions: any[] = [];
    let jobClaimed = false;

    const jobModel: any = {
      findOneAndUpdate: jest.fn((filter: any) => ({
        exec: async () => {
          if (filter.cash_commission_deducted?.$ne === true) {
            if (!jobClaimed) {
              jobClaimed = true;
              return { _id: filter._id, cash_commission_deducted: true };
            }
            return null; // Already claimed by another call
          }
          return null;
        },
      })),
    };

    const transactionModel: any = {
      findOne: jest.fn(() => ({
        session: () => ({
          exec: async () => null, // Giao dịch lần đầu chưa xuất hiện trong 500ms
        }),
      })),
      create: jest.fn(async (docs: any[]) => {
        createdTransactions.push(...docs);
        return docs;
      }),
    };

    const walletModel: any = {
      findOneAndUpdate: jest.fn((filter: any, update: any) => ({
        exec: async () => {
          if (update.$setOnInsert) {
            return { _id: walletId, balance };
          }
          if (update.$inc?.balance !== undefined) {
            balance += update.$inc.balance;
          }
          return { _id: walletId, balance };
        },
      })),
      findByIdAndUpdate: jest.fn((_id: any, update: any) => ({
        exec: async () => {
          if (update.$inc?.balance !== undefined) {
            balance += update.$inc.balance;
          }
          return { _id: walletId, balance };
        },
      })),
    };

    const service = new PaymentsService(
      walletModel,
      transactionModel,
      {} as any, // withdrawalModel
      {} as any, // helperModel
      {} as any, // notificationsService
      {} as any, // vouchersService
      {} as any, // loyaltyService
      jobModel, // position 7: jobModel
      {} as any, // contractModel
    );

    // Lần 1: Claim thành công và trừ tiền bình thường
    const tx1 = await service.deductCommissionForCashJob(helperId, jobId, 15_000, 85_000);
    expect(tx1).toBeDefined();

    // Lần 2 (chạy song song hoặc khi lần 1 đang chạy dở, tx chưa commit trong 500ms):
    // Phải bị chặn bằng ConflictException, KHÔNG được fall through trừ tiếp
    await expect(
      service.deductCommissionForCashJob(helperId, jobId, 15_000, 85_000),
    ).rejects.toBeInstanceOf(ConflictException);

    // Phí chỉ trừ đúng 1 lần
    expect(createdTransactions).toHaveLength(1);
    expect(balance).toBe(85_000);
  });
});

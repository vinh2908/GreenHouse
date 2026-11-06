import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';

/**
 * Spec B41–B44: kiểm chứng validation tiền/thanh toán/rút tiền của PaymentsService.
 * Service được khởi tạo trực tiếp với model giả tối thiểu.
 */
describe('PaymentsService - B41/B42/B43/B44 validation', () => {
  const customerId = new Types.ObjectId().toHexString();
  const helperId = new Types.ObjectId().toHexString();
  const jobId = new Types.ObjectId().toHexString();

  function makeService(balance = 1_000_000, pendingWithdrawal: any = null) {
    const walletModel: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), balance }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const createdTx: any[] = [];
    const transactionModel: any = {
      // Mongoose: create(obj) -> 1 doc, create([obj]) -> [doc] (refundCustomer dùng dạng mảng + { session })
      create: jest.fn(async (doc: any) => {
        if (Array.isArray(doc)) {
          const txs = doc.map((d: any) => ({ _id: new Types.ObjectId(), ...d }));
          createdTx.push(...txs);
          return txs;
        }
        const tx = { _id: new Types.ObjectId(), ...doc };
        createdTx.push(tx);
        return tx;
      }),
    };
    const withdrawalModel: any = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(pendingWithdrawal) }),
      create: jest.fn(async (doc: any) => ({ _id: new Types.ObjectId(), ...doc })),
    };
    const helperModel: any = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          bank_account: {
            bank_name: 'VCB',
            account_number: '123456',
            account_name: 'NGUYEN VAN A',
          },
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
    return { service, walletModel, transactionModel, withdrawalModel, createdTx };
  }

  describe('B41: mockPayJob chỉ chấp nhận payment_method hợp lệ', () => {
    it('payment_method "bitcoin" → 400', async () => {
      const { service } = makeService();
      await expect(
        service.mockPayJob(customerId, jobId, 500_000, 'bitcoin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('payment_method rỗng → 400', async () => {
      const { service } = makeService();
      await expect(service.mockPayJob(customerId, jobId, 500_000, '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('payment_method "wallet" → thành công (không chặn phương thức đang dùng)', async () => {
      const { service, createdTx } = makeService();
      const result = await service.mockPayJob(customerId, jobId, 500_000, 'wallet');
      expect(result.success).toBe(true);
      expect(createdTx[0].metadata.payment_method).toBe('wallet');
    });

    it('payment_method "vietqr" (mặc định hệ thống) → thành công', async () => {
      const { service } = makeService();
      const result = await service.mockPayJob(customerId, jobId, 500_000, 'vietqr');
      expect(result.success).toBe(true);
    });
  });

  describe('B42: refundCustomer / creditHelper chỉ nhận số tiền dương', () => {
    it('hoàn tiền -100.000₫ → 400', async () => {
      const { service } = makeService();
      await expect(
        service.refundCustomer(customerId, jobId, -100_000, 'test'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hoàn tiền 0₫ → 400', async () => {
      const { service } = makeService();
      await expect(service.refundCustomer(customerId, jobId, 0, 'test')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('hoàn tiền 350.000₫ → thành công, ví tăng đúng 350.000₫', async () => {
      const { service, walletModel, createdTx } = makeService();
      const tx = await service.refundCustomer(customerId, jobId, 350_000, 'Hoàn do hủy đơn');
      expect(tx.amount).toBe(350_000);
      expect(walletModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { $inc: { balance: 350_000 } },
        // B91: refundCustomer chạy trong transaction nên truyền thêm { session } làm đối số thứ 3
        expect.anything(),
      );
      expect(createdTx[0].balance_after).toBe(1_350_000);
    });

    it('cộng tiền thợ -50.000₫ / 0₫ → 400', async () => {
      const { service } = makeService();
      await expect(service.creditHelper(helperId, jobId, -50_000)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.creditHelper(helperId, jobId, 0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('cộng tiền thợ 200.000₫ → thành công', async () => {
      const { service } = makeService();
      const tx = await service.creditHelper(helperId, jobId, 200_000);
      expect(tx.amount).toBe(200_000);
      expect(tx.type).toBe('earning');
    });
  });

  describe('B43: giao dịch hoa hồng tiền mặt ghi đúng tiền hoa hồng', () => {
    it('đơn 500.000₫, phí sàn 10% (50.000₫) → giao dịch commission ghi 50.000₫, không phải 500.000₫', async () => {
      const { service, createdTx } = makeService();
      const tx = await service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000);
      expect(tx.type).toBe('commission');
      expect(tx.amount).toBe(50_000);
      expect(tx.balance_before).toBe(1_000_000);
      expect(tx.balance_after).toBe(950_000);
      expect(createdTx[0].metadata.helper_net_earned).toBe(450_000);
    });

    it('ví không đủ phí: chỉ trừ tối đa số dư, phần thiếu ghi unpaid_fee', async () => {
      const { service } = makeService(30_000);
      const tx: any = await service.deductCommissionForCashJob(helperId, jobId, 50_000, 450_000);
      expect(tx.amount).toBe(50_000);
      expect(tx.balance_after).toBe(0);
      expect(tx.metadata.unpaid_fee).toBe(20_000);
    });
  });

  describe('B44: requestWithdrawal — 1 yêu cầu pending duy nhất + số nguyên', () => {
    it('rút 500.000,5₫ → 400', async () => {
      const { service } = makeService();
      await expect(service.requestWithdrawal(helperId, 500_000.5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('đã có yêu cầu pending → tạo thêm yêu cầu → 409', async () => {
      const { service } = makeService(1_000_000, {
        _id: new Types.ObjectId(),
        status: 'pending',
        amount: 500_000,
      });
      await expect(service.requestWithdrawal(helperId, 300_000)).rejects.toThrow('đang chờ xử lý');
    });

    it('không có yêu cầu pending, số nguyên → tạo thành công', async () => {
      const { service, withdrawalModel } = makeService();
      const w = await service.requestWithdrawal(helperId, 500_000);
      expect(w.status).toBe('pending');
      expect(w.amount).toBe(500_000);
      expect(withdrawalModel.create).toHaveBeenCalled();
    });
  });
});

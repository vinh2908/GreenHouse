import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';

/**
 * Spec B41–B44: kiểm chứng validation tiền/thanh toán/rút tiền của PaymentsService.
 * Service được khởi tạo trực tiếp với model giả tối thiểu (các hàm kiểm chứng
 * ở đây đều chặn trước khi chạm DB nên mock rỗng là đủ; riêng B43/B44 dùng
 * mock có hành vi).
 */
describe('PaymentsService - B41/B42/B43/B44 validation', () => {
  const customerId = new Types.ObjectId().toHexString();
  const helperId = new Types.ObjectId().toHexString();
  const jobId = new Types.ObjectId().toHexString();

  function makeService(overrides: Record<string, any> = {}) {
    const walletDoc: any = { _id: new Types.ObjectId(), balance: 1_000_000 };
    const walletModel: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...walletDoc, balance: 1_000_000 }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const createdTx: any[] = [];
    const transactionModel: any = {
      create: jest.fn(async (doc: any) => {
        const tx = { _id: new Types.ObjectId(), ...doc };
        createdTx.push(tx);
        return tx;
      }),
    };
    const withdrawalModel: any = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
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
      { create: jest.fn() } as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
    );
    return { service, walletModel, transactionModel, withdrawalModel, createdTx, ...overrides };
  }

  describe('B41: mockPayJob chỉ chấp nhận payment_method hợp lệ', () => {
    it('payment_method "bitcoin" → 400', async () => {
      const { service } = makeService();
      await expect(service.mockPayJob(customerId, jobId, 500_000, 'bitcoin')).rejects.toBeInstanceOf(
        BadRequestException,
      );
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
      expect(walletModel.findByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), {
        $inc: { balance: 350_000 },
      });
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
});

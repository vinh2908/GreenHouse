import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { VouchersService } from './vouchers.service';

/** Spec B45: admin tạo/sửa voucher phải kiểm tra dữ liệu đầu vào. */
describe('VouchersService - B45 adminCreate/adminUpdate validation', () => {
  const adminId = new Types.ObjectId().toHexString();

  function makeService(existingVoucher: any = null) {
    const created: any[] = [];
    const voucherModel: any = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findById: jest.fn().mockImplementation((id: string) => ({
        exec: jest
          .fn()
          .mockResolvedValue(
            existingVoucher && String(existingVoucher._id) === String(id) ? existingVoucher : null,
          ),
      })),
      create: jest.fn(async (doc: any) => {
        const v = { _id: new Types.ObjectId(), ...doc };
        created.push(v);
        return v;
      }),
    };
    const service = new VouchersService(voucherModel, {} as any, {} as any);
    return { service, voucherModel, created };
  }

  const validDto: any = {
    code: 'GIAM50',
    description: 'Giảm 50%',
    discount_type: 'percent',
    discount_value: 50,
    max_discount_amount: 100_000,
    min_order_amount: 0,
    total_usage_limit: 100,
    per_user_limit: 1,
    is_active: true,
    valid_from: '2026-11-01T00:00:00.000Z',
    valid_to: '2026-12-01T00:00:00.000Z',
  };

  it('tạo voucher giảm 200% → 400', async () => {
    const { service } = makeService();
    await expect(
      service.adminCreate(adminId, { ...validDto, discount_value: 200 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tạo voucher hết hạn trước ngày bắt đầu → 400', async () => {
    const { service } = makeService();
    await expect(
      service.adminCreate(adminId, {
        ...validDto,
        valid_from: '2026-12-01T00:00:00.000Z',
        valid_to: '2026-11-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tạo voucher min_order âm → 400', async () => {
    const { service } = makeService();
    await expect(
      service.adminCreate(adminId, { ...validDto, min_order_amount: -10_000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tạo voucher giảm 50%, hết hạn sau 30 ngày → thành công', async () => {
    const { service, created } = makeService();
    const v = await service.adminCreate(adminId, validDto);
    expect(v.code).toBe('GIAM50');
    expect(created.length).toBe(1);
  });

  it('sửa voucher thành ngày hết hạn trước ngày bắt đầu → 400', async () => {
    const existing: any = {
      _id: new Types.ObjectId(),
      code: 'GIAM50',
      discount_type: 'percent',
      discount_value: 50,
      min_order_amount: 0,
      valid_from: new Date('2026-11-01T00:00:00.000Z'),
      valid_to: new Date('2026-12-01T00:00:00.000Z'),
      save: jest.fn(async function (this: any) {
        return this;
      }),
    };
    const { service } = makeService(existing);
    await expect(
      service.adminUpdate(String(existing._id), {
        valid_to: '2026-10-01T00:00:00.000Z',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

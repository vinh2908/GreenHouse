import { Types } from 'mongoose';
import { JobsService } from './jobs.service';

/**
 * Spec B62: createJob kiểm tra địa chỉ làm việc không trống.
 * (target_price ≥ 50k đã có ở B4, duration 15 phút–12 giờ đã có ở A9.)
 */
describe('JobsService.createJob (B62)', () => {
  const customerId = new Types.ObjectId();
  const serviceId = new Types.ObjectId();

  function makeService() {
    const userModel: any = {
      findById: jest.fn(() => ({
        select: jest.fn(() => ({ lean: async () => ({ is_verified: true }) })),
      })),
    };
    const serviceModel: any = {
      findById: jest.fn(() => ({ exec: async () => null })),
    };
    const dummy = {} as never;
    const service = new JobsService(
      dummy, // jobModel
      dummy, // quoteModel
      dummy, // contractModel
      serviceModel,
      dummy, // helperModel
      dummy, // penaltyEventModel
      userModel,
      { emitToJob: jest.fn(), emitToUser: jest.fn() } as never, // gateway
      { create: jest.fn(async () => ({})) } as never, // notificationsService
      dummy, // chatService
      dummy, // paymentsService
      dummy, // routingService
      dummy, // favoritesService
      { assertCodeAttachable: jest.fn(async () => ({ code: 'X' })) } as never, // vouchersService
      dummy, // loyaltyService
      dummy, // disputesService
    );
    return service;
  }

  function dto(address: any) {
    return {
      service_id: String(serviceId),
      title: 'Dọn nhà',
      description: 'Dọn dẹp căn hộ 2 phòng ngủ',
      preferred_date: '2099-01-01',
      preferred_time_start: '09:00',
      preferred_time_end: '11:00',
      target_price: 300_000,
      address,
    } as never;
  }

  it('address thiếu full_address → 400 "nhập địa chỉ làm việc"', async () => {
    const service = makeService();
    await expect(
      service.createJob(String(customerId), dto({ full_address: '   ' })),
    ).rejects.toThrow('Vui lòng nhập địa chỉ làm việc');
  });

  it('không truyền address → 400 "nhập địa chỉ làm việc"', async () => {
    const service = makeService();
    await expect(service.createJob(String(customerId), dto(undefined))).rejects.toThrow(
      'Vui lòng nhập địa chỉ làm việc',
    );
  });

  it('địa chỉ hợp lệ → qua được bước kiểm tra địa chỉ (lỗi sau đó không phải lỗi địa chỉ)', async () => {
    const service = makeService();
    let err: any;
    try {
      await service.createJob(
        String(customerId),
        dto({ full_address: '12 Nguyễn Văn Linh, Đà Nẵng' }),
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message).not.toContain('địa chỉ');
  });
});

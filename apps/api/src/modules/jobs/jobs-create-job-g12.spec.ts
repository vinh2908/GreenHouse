import { Types } from 'mongoose';
import { JobsService } from './jobs.service';

/**
 * Spec G12 (B62): createJob kiểm tra duration như phía báo giá
 * (CreateQuoteDto.estimated_duration: 0,5–720 giờ). Đơn phải có ít nhất 1
 * tín hiệu thời lượng: estimated_duration, hoặc cặp giờ bắt đầu + kết thúc.
 */
describe('JobsService.createJob duration (G12)', () => {
  const customerId = new Types.ObjectId();
  const serviceId = new Types.ObjectId();

  function makeService() {
    const userModel: any = {
      findById: jest.fn(() => ({
        select: jest.fn(() => ({ lean: async () => ({ is_verified: true }) })),
      })),
    };
    const serviceModel: any = {
      findById: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => null })) })),
      })),
    };
    const jobModel: any = {
      create: jest.fn(async (doc: any) => ({ ...doc, _id: new Types.ObjectId() })),
    };
    const dummy = {} as never;
    const notificationsService: any = {
      create: jest.fn(async () => ({})),
      notifyAdmins: jest.fn(async () => ({})),
    };
    const service = new JobsService(
      jobModel,
      dummy, // quoteModel
      dummy, // contractModel
      serviceModel,
      dummy, // helperModel
      dummy, // penaltyEventModel
      userModel,
      { emitToJob: jest.fn(), emitToUser: jest.fn() } as never, // gateway
      notificationsService,
      dummy, // chatService
      dummy, // paymentsService
      dummy, // routingService
      dummy, // favoritesService
      { assertCodeAttachable: jest.fn(async () => ({ code: 'X' })) } as never, // vouchersService
      dummy, // loyaltyService
      dummy, // disputesService
    );
    // Bỏ qua bước báo thợ gần (cần DB thật) — chỉ kiểm tra validation + tạo đơn.
    (service as any).notifyNearbyHelpers = jest.fn(async () => undefined);
    return { service, jobModel };
  }

  function dto(overrides: Record<string, any> = {}) {
    return {
      service_id: String(serviceId),
      title: 'Dọn nhà',
      description: 'Dọn dẹp căn hộ 2 phòng ngủ',
      preferred_date: '2099-01-01',
      preferred_time_start: '09:00',
      preferred_time_end: '11:00',
      target_price: 300_000,
      address: {
        full_address: '12 Nguyễn Văn Linh, Đà Nẵng',
        location: { type: 'Point', coordinates: [108.2, 16.05] },
      },
      ...overrides,
    } as never;
  }

  it('estimated_duration 0,2 giờ (< 0,5) → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createJob(String(customerId), dto({ estimated_duration: 0.2 })),
    ).rejects.toThrow('Thời lượng công việc phải từ 0,5 đến 720 giờ');
  });

  it('estimated_duration 800 giờ (> 720) → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createJob(String(customerId), dto({ estimated_duration: 800 })),
    ).rejects.toThrow('Thời lượng công việc phải từ 0,5 đến 720 giờ');
  });

  it('estimated_duration không phải số → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createJob(String(customerId), dto({ estimated_duration: 'ba giờ' as never })),
    ).rejects.toThrow('Thời lượng công việc phải từ 0,5 đến 720 giờ');
  });

  it('thiếu duration (không estimated_duration, không giờ kết thúc) → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createJob(
        String(customerId),
        dto({ estimated_duration: undefined, preferred_time_end: undefined }),
      ),
    ).rejects.toThrow('Vui lòng nhập thời lượng công việc');
  });

  it('duration hợp lệ qua estimated_duration (3 giờ, không cần giờ kết thúc) → tạo được', async () => {
    const { service, jobModel } = makeService();
    const job = await service.createJob(
      String(customerId),
      dto({ estimated_duration: 3, preferred_time_end: undefined }),
    );
    expect(jobModel.create).toHaveBeenCalledTimes(1);
    expect((job as any).estimated_duration).toBe(3);
  });

  it('duration hợp lệ qua cặp giờ 09:00–11:00 (không estimated_duration) → tạo được', async () => {
    const { service, jobModel } = makeService();
    const job = await service.createJob(String(customerId), dto({}));
    expect(jobModel.create).toHaveBeenCalledTimes(1);
    expect(job).toBeDefined();
  });
});

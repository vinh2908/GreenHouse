import { Types } from 'mongoose';
import { validate } from 'class-validator';
import { JobsService } from './jobs.service';
import { CreateQuoteDto } from './dto/job.dto';

/**
 * Spec G12 (B62): createJob kiểm tra duration như phía báo giá
 * (CreateQuoteDto.estimated_duration: 0,5–12 giờ). Đơn phải có ít nhất 1
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
    ).rejects.toThrow('Thời lượng công việc phải từ 0,5 đến 12 giờ');
  });

  it('H7 (G12): estimated_duration 13 giờ (> 12) → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createJob(String(customerId), dto({ estimated_duration: 13 })),
    ).rejects.toThrow('Thời lượng công việc phải từ 0,5 đến 12 giờ');
  });

  it('H7 (G12): estimated_duration 12,5 giờ (> 12) → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createJob(String(customerId), dto({ estimated_duration: 12.5 })),
    ).rejects.toThrow('Thời lượng công việc phải từ 0,5 đến 12 giờ');
  });

  it('estimated_duration không phải số → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createJob(String(customerId), dto({ estimated_duration: 'ba giờ' as never })),
    ).rejects.toThrow('Thời lượng công việc phải từ 0,5 đến 12 giờ');
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

  it('H7 (G12): estimated_duration đúng 12 giờ → tạo được', async () => {
    const { service, jobModel } = makeService();
    const job = await service.createJob(
      String(customerId),
      dto({ estimated_duration: 12, preferred_time_end: undefined }),
    );
    expect(jobModel.create).toHaveBeenCalledTimes(1);
    expect((job as any).estimated_duration).toBe(12);
  });

  it('H7 (G12): cặp giờ đúng 12 giờ (09:00–21:00) → tạo được', async () => {
    const { service, jobModel } = makeService();
    const job = await service.createJob(
      String(customerId),
      dto({ preferred_time_start: '09:00', preferred_time_end: '21:00' }),
    );
    expect(jobModel.create).toHaveBeenCalledTimes(1);
    expect(job).toBeDefined();
  });

  it('H7 (G12): cặp giờ 12 giờ 01 phút (09:00–21:01) → 400', async () => {
    const { service } = makeService();
    await expect(
      service.createJob(
        String(customerId),
        dto({ preferred_time_start: '09:00', preferred_time_end: '21:01' }),
      ),
    ).rejects.toThrow('Thời lượng công việc tối đa là 12 giờ');
  });
});

describe('CreateQuoteDto estimated_duration (H7/G12)', () => {
  function quoteDto(estimated_duration: number) {
    const q = new CreateQuoteDto();
    q.labor_cost = 200000;
    q.estimated_duration = estimated_duration;
    return q;
  }

  it('báo giá duration 12 giờ → hợp lệ (không lỗi estimated_duration)', async () => {
    const errors = await validate(quoteDto(12));
    expect(errors.filter(e => e.property === 'estimated_duration')).toHaveLength(0);
  });

  it('báo giá duration 13 giờ → 400 (lỗi validation estimated_duration)', async () => {
    const errors = await validate(quoteDto(13));
    expect(errors.filter(e => e.property === 'estimated_duration')).toHaveLength(1);
  });

  it('báo giá duration 0,5 giờ → hợp lệ (trần dưới không đổi)', async () => {
    const errors = await validate(quoteDto(0.5));
    expect(errors.filter(e => e.property === 'estimated_duration')).toHaveLength(0);
  });
});

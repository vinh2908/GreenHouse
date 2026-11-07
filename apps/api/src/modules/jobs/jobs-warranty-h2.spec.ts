import { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { JobStatus } from '@homemate/types';

/**
 * Spec H2 (R2): createWarrantyJob copy estimated_duration từ đơn gốc khi đơn
 * gốc chỉ có duration mà thiếu giờ kết thúc; CreateWarrantyDto có trường
 * duration tùy chọn; giờ bảo hành mặc định qua gate 07:00–22:00.
 * createJob thật được stub để chỉ kiểm chứng DTO chuyển vào nó.
 */
describe('JobsService.createWarrantyJob (H2/R2)', () => {
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const sourceJobId = new Types.ObjectId();

  function makeService() {
    const contractModel: any = {
      findOne: jest.fn(() => ({
        exec: jest.fn(async () => ({ warranty_days: 30, completed_at: new Date() })),
      })),
    };
    const jobModel: any = {
      findById: jest.fn(),
      // getWarrantyInfo: không có đơn bảo hành đang xử lý
      findOne: jest.fn(() => ({
        select: jest.fn(() => ({ exec: jest.fn(async () => null) })),
      })),
    };
    const dummy = {} as never;
    const service = new JobsService(
      jobModel,
      dummy, // quoteModel
      contractModel,
      dummy, // serviceModel
      dummy, // helperModel
      dummy, // penaltyEventModel
      dummy, // userModel
      { emitToJob: jest.fn(), emitToUser: jest.fn() } as never, // gateway
      { create: jest.fn(async () => ({})) } as never, // notificationsService
      dummy, // chatService
      dummy, // paymentsService
      dummy, // routingService
      dummy, // favoritesService
      dummy, // vouchersService
      dummy, // loyaltyService
      dummy, // disputesService
    );
    const createJob = jest.fn(async (_cid: string, dto: any) => ({
      ...dto,
      _id: new Types.ObjectId(),
    }));
    (service as any).createJob = createJob;
    return { service, jobModel, createJob };
  }

  function sourceJob(overrides: Record<string, any> = {}) {
    return {
      _id: sourceJobId,
      customer_id: customerId,
      helper_id: helperId,
      status: JobStatus.COMPLETED,
      is_warranty: false,
      service_id: new Types.ObjectId(),
      custom_service_name: undefined,
      target_price: 300000,
      title: 'Dọn nhà',
      description: 'Dọn dẹp căn hộ',
      photos: [],
      videos: [],
      address: {
        full_address: '12 Nguyễn Văn Linh, Đà Nẵng',
        ward: 'An Hải Bắc',
        district: 'Sơn Trà',
        city: 'Đà Nẵng',
        notes: undefined,
        location: { coordinates: [108.2, 16.05] },
      },
      preferred_date: '2099-01-01',
      preferred_time_start: '09:00',
      preferred_time_end: '11:00',
      estimated_duration: undefined,
      is_flexible_time: false,
      updated_at: new Date(),
      ...overrides,
    };
  }

  function setup(source: any) {
    const { service, jobModel, createJob } = makeService();
    jobModel.findById.mockReturnValue({ exec: jest.fn(async () => source) });
    return { service, createJob };
  }

  const warrantyDto = (overrides: Record<string, any> = {}) =>
    ({ issue_description: 'Vết bẩn còn sót lại', ...overrides }) as never;

  it('đơn gốc duration-only (3h, không giờ kết thúc) → bảo hành được, copy estimated_duration 3', async () => {
    const { service, createJob } = setup(
      sourceJob({ preferred_time_end: undefined, estimated_duration: 3 }),
    );
    await service.createWarrantyJob(String(customerId), String(sourceJobId), warrantyDto());
    expect(createJob).toHaveBeenCalledTimes(1);
    const dto = createJob.mock.calls[0][1];
    expect(dto.estimated_duration).toBe(3);
    expect(dto.preferred_time_end).toBeUndefined();
    expect(dto.preferred_time_start).toBe('09:00');
  });

  it('đơn gốc có cặp giờ (09:00–11:00) → bảo hành như cũ, giữ giờ kết thúc, không copy duration', async () => {
    const { service, createJob } = setup(sourceJob({ estimated_duration: undefined }));
    await service.createWarrantyJob(String(customerId), String(sourceJobId), warrantyDto());
    expect(createJob).toHaveBeenCalledTimes(1);
    const dto = createJob.mock.calls[0][1];
    expect(dto.preferred_time_end).toBe('11:00');
    expect(dto.estimated_duration).toBeUndefined();
  });

  it('đơn gốc giờ 23:00 → lỗi rõ ràng về giờ làm việc, không gọi createJob', async () => {
    const { service, createJob } = setup(
      sourceJob({ preferred_time_start: '23:00', preferred_time_end: '23:30' }),
    );
    await expect(
      service.createWarrantyJob(String(customerId), String(sourceJobId), warrantyDto()),
    ).rejects.toThrow('nằm ngoài giờ làm việc 07:00–22:00');
    expect(createJob).not.toHaveBeenCalled();
  });

  it('đơn gốc giờ 22:00 đúng → qua gate (H4), bảo hành được', async () => {
    const { service, createJob } = setup(
      sourceJob({ preferred_time_start: '22:00', preferred_time_end: '23:00' }),
    );
    await service.createWarrantyJob(String(customerId), String(sourceJobId), warrantyDto());
    expect(createJob).toHaveBeenCalledTimes(1);
  });

  it('đơn gốc duration-only 20 giờ (> trần 12) → lỗi rõ ràng, không cắt ngầm, không gọi createJob', async () => {
    const { service, createJob } = setup(
      sourceJob({ preferred_time_end: undefined, estimated_duration: 20 }),
    );
    await expect(
      service.createWarrantyJob(String(customerId), String(sourceJobId), warrantyDto()),
    ).rejects.toThrow('vượt trần hiện tại 12 giờ');
    expect(createJob).not.toHaveBeenCalled();
  });

  it('đơn gốc duration 20 giờ + khách nhập duration 4 qua DTO → bảo hành được với duration 4', async () => {
    const { service, createJob } = setup(
      sourceJob({ preferred_time_end: undefined, estimated_duration: 20 }),
    );
    await service.createWarrantyJob(
      String(customerId),
      String(sourceJobId),
      warrantyDto({ estimated_duration: 4 }),
    );
    expect(createJob).toHaveBeenCalledTimes(1);
    expect(createJob.mock.calls[0][1].estimated_duration).toBe(4);
  });

  it('đơn gốc không có tín hiệu thời lượng nào → lỗi rõ ràng hướng nhập duration', async () => {
    const { service, createJob } = setup(
      sourceJob({ preferred_time_end: undefined, estimated_duration: undefined }),
    );
    await expect(
      service.createWarrantyJob(String(customerId), String(sourceJobId), warrantyDto()),
    ).rejects.toThrow('không có thông tin thời lượng');
    expect(createJob).not.toHaveBeenCalled();
  });

  it('đơn gốc không có tín hiệu thời lượng + khách nhập duration 2 → bảo hành được', async () => {
    const { service, createJob } = setup(
      sourceJob({ preferred_time_end: undefined, estimated_duration: undefined }),
    );
    await service.createWarrantyJob(
      String(customerId),
      String(sourceJobId),
      warrantyDto({ estimated_duration: 2 }),
    );
    expect(createJob).toHaveBeenCalledTimes(1);
    expect(createJob.mock.calls[0][1].estimated_duration).toBe(2);
  });

  it('khách nhập duration 13 giờ qua DTO → 400 (trần 12 giờ)', async () => {
    const { service, createJob } = setup(sourceJob({}));
    await expect(
      service.createWarrantyJob(
        String(customerId),
        String(sourceJobId),
        warrantyDto({ estimated_duration: 13 }),
      ),
    ).rejects.toThrow('Thời lượng công việc phải từ 0,5 đến 12 giờ');
    expect(createJob).not.toHaveBeenCalled();
  });

  it('khách nhập duration mới + đơn gốc có cặp giờ → duration thắng, bỏ giờ kết thúc cũ', async () => {
    const { service, createJob } = setup(sourceJob({}));
    await service.createWarrantyJob(
      String(customerId),
      String(sourceJobId),
      warrantyDto({ estimated_duration: 2 }),
    );
    expect(createJob).toHaveBeenCalledTimes(1);
    const dto = createJob.mock.calls[0][1];
    expect(dto.estimated_duration).toBe(2);
    expect(dto.preferred_time_end).toBeUndefined();
  });
});

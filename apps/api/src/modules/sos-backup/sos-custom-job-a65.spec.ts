import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';

/**
 * Spec G16 (A65): SOS cho đơn TỰ VIẾT (không service_id) — computeCandidatePool
 * chỉ lọc theo service_ids khi job.service_id tồn tại; đơn tự viết cho phép
 * mọi thợ online đủ điều kiện vào pool.
 */
describe('SosBackupService.computeCandidatePool — custom job (G16/A65)', () => {
  function makeService() {
    const helperId = new Types.ObjectId();
    const customerId = new Types.ObjectId();
    const originalHelperId = new Types.ObjectId();

    const profile: any = {
      _id: new Types.ObjectId(),
      user_id: helperId,
      status: 'online',
      verification_status: 'approved',
      service_ids: [], // thợ KHÔNG có service nào — đơn tự viết vẫn phải match
      location: { type: 'Point', coordinates: [108.21, 16.06] },
      location_source: 'manual',
      last_location_update: new Date(),
      rating: 4.5,
      completed_jobs: 10,
      cancellation_timestamps: [],
    };

    const helperModel: any = {
      // Trả profile khi KHÔNG lọc theo service; trả rỗng khi có lọc service
      // (mô phỏng: thợ này không có service đó trong service_ids).
      find: jest.fn((filter: Record<string, unknown>) => ({
        exec: async () => (('service_ids' in filter || '$or' in filter) ? [] : [profile]),
      })),
    };
    const jobModel: any = {
      find: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
      })),
    };
    const dummy = {} as never;
    const service = new SosBackupService(
      dummy, // sosModel
      jobModel,
      dummy, // contractModel
      helperModel,
      dummy, // penaltyEventModel
      dummy, // userModel
      dummy, // gateway
      dummy, // chatService
      { create: jest.fn(async () => ({})) } as never, // notificationsService
      dummy, // paymentsService
      dummy, // vouchersService
      dummy, // loyaltyService
      { get: jest.fn(() => undefined) } as never, // configService (mặc định)
    );
    return { service, helperModel, helperId, customerId, originalHelperId };
  }

  function makeSos(originalHelperId: Types.ObjectId) {
    return {
      _id: new Types.ObjectId(),
      original_helper_id: originalHelperId,
    } as any;
  }

  function makeCustomJob(customerId: Types.ObjectId) {
    return {
      _id: new Types.ObjectId(),
      customer_id: customerId,
      service_id: undefined, // đơn tự viết: không có service trong danh mục
      custom_service_name: 'Sửa máy lạnh kêu lạ lúc nửa đêm',
      address: { location: { type: 'Point', coordinates: [108.2, 16.05] } },
    } as any;
  }

  it('đơn tự viết: KHÔNG lọc service_ids, thợ online đủ điều kiện vào pool', async () => {
    const { service, helperModel, helperId, customerId, originalHelperId } = makeService();
    const job = makeCustomJob(customerId);
    const sos = makeSos(originalHelperId);

    const pool = await (service as any).computeCandidatePool(job, sos);

    expect(helperModel.find).toHaveBeenCalledWith(
      expect.not.objectContaining({ service_ids: expect.anything() }),
    );
    expect(pool).toHaveLength(1);
    expect(pool[0].helperId).toBe(String(helperId));
    expect(pool[0].distanceKm).toBeLessThan(30);
  });

  it('đơn có service_id: CÓ lọc service_ids, thợ không có service đó bị loại', async () => {
    const { service, helperModel, customerId, originalHelperId } = makeService();
    const serviceId = new Types.ObjectId();
    const job = {
      ...makeCustomJob(customerId),
      service_id: serviceId,
      custom_service_name: undefined,
    } as any;
    const sos = makeSos(originalHelperId);

    const pool = await (service as any).computeCandidatePool(job, sos);

    expect(helperModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([{ service_ids: serviceId }]),
      }),
    );
    expect(pool).toHaveLength(0);
  });
});

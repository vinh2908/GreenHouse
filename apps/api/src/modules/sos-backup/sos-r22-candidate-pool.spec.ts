import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';
import { SosBackupStatus } from './schemas/sos-backup.schema';
import { HelperStatus, JobStatus, VerificationStatus } from '@homemate/types';

/**
 * R22 Mục 2 & Mục 3:
 *  - Vị trí ghim tay ('manual') KHÔNG bị loại bởi hạn GPS 120 phút.
 *  - Thợ OFFLINE hoạt động gần đây (< 24h) được mời vào pool và nhận thay được qua push.
 *  - Pool rỗng KHÔNG hết hạn sớm trước TTL; sweep giữ PENDING và leo thang theo đợt.
 *  - getByJob trả đầy đủ số liệu pending (max_waves, invited_count, active_invited_count, declined_count).
 */
describe('SosBackupService — R22 Mục 2 & 3 (candidate pool, TTL & pending metrics)', () => {
  const customerId = new Types.ObjectId();
  const originalHelperId = new Types.ObjectId();
  const serviceId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  function makeJob() {
    return {
      _id: jobId,
      customer_id: customerId,
      helper_id: originalHelperId,
      service_id: serviceId,
      title: 'TEST R22 SOS',
      status: JobStatus.CONFIRMED,
      address: {
        district: 'Thanh Khê',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.205699, 16.058656] },
      },
      events: [],
    } as any;
  }

  function buildServiceWithProfiles(profiles: any[], opts: { onUpdateOne?: jest.Mock } = {}) {
    const sosModel: any = {
      find: jest.fn(() => ({ exec: async () => [] })),
      findOne: jest.fn(() => ({ exec: async () => null })),
      findById: jest.fn(() => ({ exec: async () => null })),
      updateOne: opts.onUpdateOne ?? jest.fn(() => ({ exec: async () => ({ modifiedCount: 1 }) })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
    };
    const jobModel: any = {
      find: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
        exec: async () => [],
      })),
      findById: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => makeJob() })) })),
        exec: async () => makeJob(),
      })),
      exists: jest.fn(() => ({ exec: async () => false })),
      countDocuments: jest.fn(() => ({ exec: async () => 0 })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => makeJob() })),
    };
    const helperModel: any = {
      find: jest.fn(() => ({ exec: async () => profiles })),
      findOne: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => profiles[0] ?? null })) })),
        exec: async () => profiles[0] ?? null,
      })),
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
    };
    const userModel: any = {
      find: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => [] })) })),
      })),
      findById: jest.fn(() => ({
        select: jest.fn(() => ({
          lean: jest.fn(() => ({ exec: async () => ({ full_name: 'Đào Phước Long' }) })),
        })),
      })),
    };
    const gateway: any = { emitToUser: jest.fn(), emitToJob: jest.fn() };
    const notificationsService: any = { create: jest.fn(async () => ({})) };
    const dummy = {} as never;

    const service = new SosBackupService(
      sosModel,
      jobModel,
      { updateOne: jest.fn(() => ({ exec: async () => ({}) })) } as never,
      helperModel,
      dummy,
      userModel,
      gateway,
      { addParticipantByJob: jest.fn(async () => undefined) } as never,
      notificationsService,
      dummy,
      dummy,
      dummy,
      { get: jest.fn(() => undefined) } as never,
    );
    return { service, sosModel, jobModel, helperModel, gateway, notificationsService };
  }

  it('vị trí ghim tay (manual) có last_location_update > 120 phút vẫn đủ điều kiện vào pool', async () => {
    const manualHelperId = new Types.ObjectId();
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 3600_000);
    const { service } = buildServiceWithProfiles([
      {
        user_id: manualHelperId,
        status: HelperStatus.ONLINE,
        verification_status: VerificationStatus.APPROVED,
        service_ids: [],
        location: { type: 'Point', coordinates: [108.2093, 16.0613] }, // ~480m
        location_source: 'manual',
        last_location_update: fourDaysAgo,
        rating: 5,
        completed_jobs: 10,
        cancellation_timestamps: [],
      },
    ]);

    const pool = await (service as any).computeCandidatePool(makeJob(), {
      _id: new Types.ObjectId(),
      original_helper_id: originalHelperId,
    });

    expect(pool).toHaveLength(1);
    expect(pool[0].helperId).toBe(String(manualHelperId));
  });

  it('vị trí GPS tự động quá 120 phút vẫn bị loại đúng quy tắc H22', async () => {
    const staleGpsHelperId = new Types.ObjectId();
    const threeHoursAgo = new Date(Date.now() - 150 * 60_000);
    const { service } = buildServiceWithProfiles([
      {
        user_id: staleGpsHelperId,
        status: HelperStatus.ONLINE,
        verification_status: VerificationStatus.APPROVED,
        service_ids: [],
        location: { type: 'Point', coordinates: [108.2093, 16.0613] },
        location_source: 'gps',
        last_location_update: threeHoursAgo,
        rating: 5,
        completed_jobs: 10,
        cancellation_timestamps: [],
      },
    ]);

    const pool = await (service as any).computeCandidatePool(makeJob(), {
      _id: new Types.ObjectId(),
      original_helper_id: originalHelperId,
    });

    expect(pool).toHaveLength(0);
  });

  it('thợ OFFLINE hoạt động gần đây (< 24h) được đưa vào pool và vẫn lọc bỏ thợ OFFLINE cũ (> 24h)', async () => {
    const recentOfflineId = new Types.ObjectId();
    const oldOfflineId = new Types.ObjectId();
    const { service } = buildServiceWithProfiles([
      {
        user_id: recentOfflineId,
        status: HelperStatus.OFFLINE,
        verification_status: VerificationStatus.APPROVED,
        service_ids: [serviceId],
        location: { type: 'Point', coordinates: [108.208, 16.06] },
        location_source: 'manual',
        updated_at: new Date(Date.now() - 2 * 3600_000),
        rating: 4.9,
        completed_jobs: 5,
        cancellation_timestamps: [],
      },
      {
        user_id: oldOfflineId,
        status: HelperStatus.OFFLINE,
        verification_status: VerificationStatus.APPROVED,
        service_ids: [serviceId],
        location: { type: 'Point', coordinates: [108.208, 16.06] },
        location_source: 'manual',
        updated_at: new Date(Date.now() - 10 * 24 * 3600_000),
        last_location_update: new Date(Date.now() - 10 * 24 * 3600_000),
        rating: 4.9,
        completed_jobs: 5,
        cancellation_timestamps: [],
      },
    ]);

    const pool = await (service as any).computeCandidatePool(makeJob(), {
      _id: new Types.ObjectId(),
      original_helper_id: originalHelperId,
    });

    expect(pool).toHaveLength(1);
    expect(pool[0].helperId).toBe(String(recentOfflineId));
  });

  it('thợ OFFLINE được mời từ push notification bấm acceptSos vẫn nhận thay thành công', async () => {
    const offlineHelperId = new Types.ObjectId();
    const sosId = new Types.ObjectId();
    const profile = {
      user_id: offlineHelperId,
      status: HelperStatus.OFFLINE,
      verification_status: VerificationStatus.APPROVED,
    };
    const sosDoc: any = {
      _id: sosId,
      job_id: jobId,
      customer_id: customerId,
      original_helper_id: originalHelperId,
      status: SosBackupStatus.PENDING,
      reason: 'personal_emergency',
      expires_at: new Date(Date.now() + 180_000),
      candidates: [{ helper_id: offlineHelperId, state: 'invited', wave: 1 }],
      toObject() {
        return { ...this };
      },
    };
    const { service, sosModel, helperModel } = buildServiceWithProfiles([profile]);
    sosModel.findById = jest.fn(() => ({ exec: async () => sosDoc }));
    sosModel.findOneAndUpdate = jest.fn(() => ({ exec: async () => sosDoc }));

    const res = await service.acceptSos(String(offlineHelperId), String(sosId));
    expect(res).toBeDefined();
    expect(helperModel.updateOne).toHaveBeenCalledWith(
      { user_id: offlineHelperId, status: HelperStatus.OFFLINE },
      { status: HelperStatus.ONLINE },
    );
  });

  it('pool rỗng ở đợt 1: sweep KHÔNG được expire sớm sau 15s mà giữ PENDING đủ tới TTL', async () => {
    const sosId = new Types.ObjectId();
    const sos = {
      _id: sosId,
      job_id: jobId,
      customer_id: customerId,
      original_helper_id: originalHelperId,
      status: SosBackupStatus.PENDING,
      current_wave: 1,
      wave_started_at: new Date(Date.now() - 20_000), // mới trôi qua 20s (< 120s)
      expires_at: new Date(Date.now() + 340_000), // còn 5p40s TTL
      candidates: [],
    } as any;

    const { service, sosModel } = buildServiceWithProfiles([]);
    sosModel.find = jest.fn((filter: any) => ({
      exec: async () => (filter?.status === SosBackupStatus.PENDING ? [sos] : []),
    }));
    const expireSpy = jest.fn(async () => undefined);
    (service as any).expireSos = expireSpy;
    const inviteSpy = jest.fn(async () => undefined);
    (service as any).inviteWave = inviteSpy;

    await (service as any).sweep();

    // Không được hết hạn sớm; quét lại trong cùng đợt 1
    expect(expireSpy).not.toHaveBeenCalled();
    expect(inviteSpy).toHaveBeenCalledWith(sos, 1);
  });

  it('getByJob trả về max_waves, invited_count, active_invited_count, declined_count cho UI khách', async () => {
    const sosDoc: any = {
      _id: new Types.ObjectId(),
      job_id: jobId,
      customer_id: customerId,
      original_helper_id: originalHelperId,
      status: SosBackupStatus.PENDING,
      current_wave: 2,
      expires_at: new Date(Date.now() + 200_000),
      candidates: [
        { helper_id: new Types.ObjectId(), wave: 1, state: 'declined' },
        { helper_id: new Types.ObjectId(), wave: 2, state: 'invited' },
        { helper_id: new Types.ObjectId(), wave: 0, state: 'ranked' },
      ],
      toObject() {
        return { ...this };
      },
    };
    const { service, sosModel } = buildServiceWithProfiles([]);
    sosModel.find = jest.fn(() => ({
      sort: jest.fn(() => ({ exec: async () => [sosDoc] })),
    }));

    const res = await service.getByJob(String(customerId), String(jobId));
    expect(res.sos).toBeTruthy();
    expect((res.sos as any).max_waves).toBe(3);
    expect((res.sos as any).invited_count).toBe(2);
    expect((res.sos as any).active_invited_count).toBe(1);
    expect((res.sos as any).declined_count).toBe(1);
  });
});

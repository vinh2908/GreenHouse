import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';
import { SosBackupStatus } from './schemas/sos-backup.schema';

/** Spec B66: SOS tối đa 3 đợt phát, mỗi đợt cách 2 phút; sau đợt 3 dừng + báo khách. */
describe('SosBackupService wave cap (B66)', () => {
  function makeService() {
    const sosModel: any = {
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => ({ _id: new Types.ObjectId() }) })),
      find: jest.fn(() => ({ exec: async () => [] })),
      findById: jest.fn(() => ({ exec: async () => null })),
    };
    const dummy = {} as never;
    const gateway = { emitToUser: jest.fn() };
    const service = new SosBackupService(
      sosModel,
      dummy, // jobModel
      dummy, // contractModel
      dummy, // helperModel
      dummy, // penaltyEventModel
      dummy, // userModel
      gateway as never,
      dummy, // chatService
      { create: jest.fn(async () => ({})) } as never, // notificationsService
      dummy, // paymentsService
      dummy, // vouchersService
      dummy, // loyaltyService
      { get: jest.fn(() => undefined) } as never, // configService (mặc định)
    );
    return { service, sosModel, gateway };
  }

  function makeSos(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(),
      job_id: new Types.ObjectId(),
      job_title: 'Dọn nhà SOS',
      service_name: 'Dọn nhà',
      district: 'Hải Châu',
      city: 'Đà Nẵng',
      helper_payout: 300_000,
      customer_id: new Types.ObjectId(),
      original_helper_id: new Types.ObjectId(),
      status: SosBackupStatus.PENDING,
      current_wave: 3,
      wave_started_at: new Date(Date.now() - 3 * 60 * 1000),
      expires_at: new Date(Date.now() + 600_000),
      candidates: [{ helper_id: new Types.ObjectId(), state: 'invited', wave: 3 }],
      ...overrides,
    } as any;
  }

  it('mặc định: tối đa 3 đợt, đợt cách 2 phút, TTL phát sóng 6 phút', () => {
    const { service } = makeService();
    expect((service as any).maxWaves).toBe(3);
    expect((service as any).waveIntervalMs).toBe(120_000);
    expect((service as any).broadcastTtlMs).toBe(360_000);
  });

  it('inviteWave đợt 4 → không mời thêm (không update, không emit)', async () => {
    const { service, sosModel, gateway } = makeService();
    const sos = makeSos({ current_wave: 3 });
    (service as any).runGlobalMatching = jest.fn(async () => {
      throw new Error('không được gọi runGlobalMatching ở đợt 4');
    });
    await (service as any).inviteWave(sos, 4);
    expect(sosModel.updateOne).not.toHaveBeenCalled();
    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });

  it('escalateOrExpire khi đã đủ 3 đợt → expireSos với lý do max_waves', async () => {
    const { service } = makeService();
    const sos = makeSos({ current_wave: 3, candidates: [] });
    const expireSpy = jest.fn(async () => undefined);
    (service as any).expireSos = expireSpy;
    await (service as any).escalateOrExpire(sos);
    expect(expireSpy).toHaveBeenCalledWith(sos, 'max_waves');
  });

  it('sweep: SOS đang ở đợt 3 quá 2 phút mà chưa ai nhận → expireSos max_waves', async () => {
    const { service, sosModel } = makeService();
    const sos = makeSos();
    sosModel.find.mockImplementation((filter: any) => ({
      exec: async () => (filter?.status === SosBackupStatus.PENDING ? [sos] : []),
    }));
    const expireSpy = jest.fn(async () => undefined);
    (service as any).expireSos = expireSpy;
    await (service as any).sweep();
    expect(expireSpy).toHaveBeenCalledWith(sos, 'max_waves');
  });

  it('sweep: SOS đang ở đợt 2 quá 2 phút → mời đợt 3, chưa hết hạn', async () => {
    const { service, sosModel } = makeService();
    const sos = makeSos({ current_wave: 2 });
    sosModel.find.mockImplementation((filter: any) => ({
      exec: async () => (filter?.status === SosBackupStatus.PENDING ? [sos] : []),
    }));
    const expireSpy = jest.fn(async () => undefined);
    (service as any).expireSos = expireSpy;
    const inviteSpy = jest.fn(async () => undefined);
    (service as any).inviteWave = inviteSpy;
    await (service as any).sweep();
    expect(expireSpy).not.toHaveBeenCalled();
    expect(inviteSpy).toHaveBeenCalledWith(sos, 3);
  });
});

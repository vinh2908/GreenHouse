import { Types } from 'mongoose';
import { SosBackupService } from './sos-backup.service';

/**
 * Spec B64 (hồi quy): inviteWave chỉ loại trừ thợ đã mời/từ chối trong lần
 * SOS HIỆN TẠI (sos.candidates của doc này). Thợ từ chối ở lần SOS trước
 * (doc SOS khác) không bị loại — lần SOS mới mời lại bình thường.
 * Code hiện tại đã đúng yêu cầu; test này khóa hành vi lại.
 */
describe('SosBackupService.inviteWave (B64)', () => {
  const helperA = new Types.ObjectId(); // từ chối ở lần SOS TRƯỚC (không có trong candidates của SOS này)
  const helperB = new Types.ObjectId(); // thợ mới, chưa mời bao giờ
  const helperC = new Types.ObjectId(); // từ chối trong lần SOS NÀY → phải bị loại

  function makeService() {
    const sosModel: any = {
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
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
      { get: jest.fn(() => undefined) } as never, // configService
    );
    return { service, gateway };
  }

  function makeSos(candidates: any[]) {
    const sos: any = {
      _id: new Types.ObjectId(),
      job_id: new Types.ObjectId(),
      job_title: 'Dọn nhà SOS',
      service_name: 'Dọn nhà',
      district: 'Hải Châu',
      city: 'Đà Nẵng',
      helper_payout: 300_000,
      current_wave: 0,
      expires_at: new Date(Date.now() + 600_000),
      candidates,
    };
    return sos;
  }

  function poolFor(helperId: Types.ObjectId, cost: number) {
    return {
      helperId: String(helperId),
      cost,
      distanceKm: 2,
      penaltyPoints: 0,
      rating: 5,
      completedJobs: 10,
      activeJobs: 0,
    };
  }

  function stubMatching(service: SosBackupService, sos: any, pool: any[]) {
    (service as any).runGlobalMatching = jest.fn(
      async () => new Map([[String(sos._id), { pool, optimalHelperId: String(pool[0].helperId) }]]),
    );
  }

  it('thợ từ chối ở SOS trước + thợ mới → cả 2 đều được mời ở đợt 1 của SOS mới', async () => {
    const { service, gateway } = makeService();
    const sos = makeSos([]); // SOS mới: chưa có ứng viên nào
    stubMatching(service, sos, [poolFor(helperA, 10), poolFor(helperB, 20)]);
    await (service as any).inviteWave(sos, 1);

    const invited = (gateway.emitToUser as jest.Mock).mock.calls.map(c => c[0]);
    expect(invited).toContain(String(helperA));
    expect(invited).toContain(String(helperB));
    expect(sos.candidates).toHaveLength(2);
    expect(sos.candidates.every((c: any) => c.state === 'invited')).toBe(true);
  });

  it('thợ đã từ chối trong lần SOS NÀY → không được mời lại ở đợt sau', async () => {
    const { service, gateway } = makeService();
    const sos = makeSos([
      {
        helper_id: helperC,
        wave: 1,
        state: 'declined',
        cost: 5,
        distance_km: 1,
        penalty_points: 0,
        rating: 5,
        completed_jobs: 10,
        active_jobs: 0,
      },
    ]);
    stubMatching(service, sos, [poolFor(helperC, 5), poolFor(helperB, 20)]);
    await (service as any).inviteWave(sos, 2);

    const invited = (gateway.emitToUser as jest.Mock).mock.calls.map(c => c[0]);
    expect(invited).not.toContain(String(helperC));
    expect(invited).toContain(String(helperB));
  });
});

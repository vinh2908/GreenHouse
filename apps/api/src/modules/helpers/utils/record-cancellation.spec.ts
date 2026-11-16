import { Types } from 'mongoose';
import { recordHelperCancellation } from './record-cancellation';

/**
 * H2 (R11): SOS phải được tính vào cửa sổ hủy 7 ngày (điểm UY TÍN) như hủy
 * đơn thường — căn cứ quyết định là comment trong createSos
 * (sos-backup.service.ts: "1 lần SOS = 1 lần thợ không thể hoàn thành đơn →
 * tính vào cửa sổ hủy 7 ngày như hủy đơn thường. Đây là điểm UY TÍN, khác
 * với 'không bị phạt' của SOS (không tính late-cancel/risk cho chính đơn
 * này)"). Nhánh sos_initiation cũ chỉ prune rồi tính lại mà KHÔNG append
 * mốc mới nên thợ SOS bao nhiêu lần cũng không bị trừ điểm uy tín.
 * Fix: append mốc mới vào danh sách đã prune rồi mới recompute — giống hệt
 * hủy đơn thường; KHÔNG động tới late_cancellation_count/risk_score của
 * đơn này (phần đó thuộc về cancelJob, không nằm trong hàm này).
 */
describe('recordHelperCancellation — SOS counts toward the 7-day window (H2)', () => {
  const NOW = new Date('2026-11-16T10:00:00.000Z');
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
  const helperId = new Types.ObjectId().toHexString();
  const jobId = new Types.ObjectId().toHexString();
  const sosId = new Types.ObjectId().toHexString();

  function makeProfile(timestamps: Date[]): any {
    return {
      user_id: new Types.ObjectId(helperId),
      rating: 5,
      verification_status: 'approved',
      service_ids: ['svc1'],
      cancellation_timestamps: [...timestamps],
      late_cancellation_count: 0,
      risk_score: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };
  }

  function makeModels(profile: any) {
    const helperModel = {
      findOne: jest.fn().mockReturnValue({ exec: async () => profile }),
    } as any;
    const penaltyEventModel = {
      create: jest.fn().mockResolvedValue({}),
    } as any;
    return { helperModel, penaltyEventModel };
  }

  async function callSos(profile: any, penaltyEventModel: any) {
    const { helperModel } = makeModels(profile);
    return recordHelperCancellation({
      helperModel,
      penaltyEventModel,
      helperId,
      source: 'sos_initiation',
      jobId,
      sosId,
      now: NOW,
    });
  }

  it('SOS là lần hủy thứ 4 trong 7 ngày → append mốc, trừ 5 điểm, ghi HelperPenaltyEvent', async () => {
    const profile = makeProfile([hoursAgo(1), hoursAgo(30), hoursAgo(100)]);
    const { penaltyEventModel } = makeModels(profile);
    const result = await callSos(profile, penaltyEventModel);

    expect(profile.cancellation_timestamps).toHaveLength(4);
    expect(profile.cancellations_last_7_days).toBe(4);
    expect(profile.penalty_points).toBe(5);
    expect(result?.just_penalized).toBe(true);
    expect(result?.points_deducted_now).toBe(5);
    expect(penaltyEventModel.create).toHaveBeenCalledTimes(1);
    expect(penaltyEventModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'sos_initiation',
        cancellations_in_window: 4,
        points_deducted: 5,
      }),
    );
  });

  it('SOS khi chưa tới ngưỡng → append mốc nhưng không trừ điểm, không ghi event', async () => {
    const profile = makeProfile([]);
    const { penaltyEventModel } = makeModels(profile);
    const result = await callSos(profile, penaltyEventModel);

    expect(profile.cancellation_timestamps).toHaveLength(1);
    expect(profile.cancellations_last_7_days).toBe(1);
    expect(profile.penalty_points).toBe(0);
    expect(result?.just_penalized).toBe(false);
    expect(result?.points_deducted_now).toBe(0);
    expect(penaltyEventModel.create).not.toHaveBeenCalled();
  });

  it('SOS không động tới late_cancellation_count / risk_score của chính đơn này', async () => {
    const profile = makeProfile([hoursAgo(1), hoursAgo(30), hoursAgo(100)]);
    const { penaltyEventModel } = makeModels(profile);
    await callSos(profile, penaltyEventModel);

    expect(profile.late_cancellation_count).toBe(0);
    expect(profile.risk_score).toBe(0);
  });
});

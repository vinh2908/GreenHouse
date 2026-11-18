import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

/**
 * Spec cho AdminService — giám sát SOS (flagged list), sổ phạt, và miễn phạt
 * (waive) kèm tính lại điểm. Model giả in-memory.
 *
 * Kịch bản điểm (G8 — 1 công thức duy nhất Distance 40 / Skill 30 /
 * Rating 20 / KYC 10 − phạt hủy): thợ rating 5, đã duyệt e-KYC, có đăng ký
 * dịch vụ, không có đơn tham chiếu nên khoảng cách = 0đ → 4 tiêu chí =
 * 0 + 30 + 20 + 10 = 60đ cố định; phạt hủy trừ vào tổng.
 * 5 mốc hủy/7 ngày → phạt 10 → tổng 50. Miễn sự kiện của lần hủy thứ 5 →
 * còn 4 mốc → phạt 5 → tổng 55.
 */

type Doc = Record<string, unknown>;

const eq = (a: unknown, b: unknown): boolean =>
  a instanceof Types.ObjectId || b instanceof Types.ObjectId ? String(a) === String(b) : a === b;

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    const val = doc[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Types.ObjectId)) {
      const ops = cond as Record<string, unknown>;
      if ('$ne' in ops && eq(val, ops['$ne'])) return false;
      if ('$in' in ops && !(ops['$in'] as unknown[]).some(v => eq(val, v))) return false;
      continue;
    }
    if (!eq(val, cond)) return false;
  }
  return true;
}

function applySet(doc: Doc, update: Record<string, unknown>): void {
  Object.assign(doc, (update['$set'] as Doc) ?? {});
}

function chainable(docs: Doc[]) {
  let sortSpec: Record<string, number> | undefined;
  let skipN = 0;
  let limitN = docs.length;
  const q = {
    populate: () => q,
    sort: (spec: Record<string, number>) => {
      sortSpec = spec;
      return q;
    },
    skip: (n: number) => {
      skipN = n;
      return q;
    },
    limit: (n: number) => {
      limitN = n;
      return q;
    },
    exec: async () => {
      const out = [...docs];
      if (sortSpec) {
        const [field, dir] = Object.entries(sortSpec)[0]!;
        out.sort(
          (a, b) =>
            (new Date(a[field] as string).getTime() - new Date(b[field] as string).getTime()) *
            (dir === -1 ? -1 : 1),
        );
      }
      return out.slice(skipN, skipN + limitN);
    },
  };
  return q;
}

const HOUR = 60 * 60 * 1000;

function makeService() {
  const adminId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const otherHelperId = new Types.ObjectId();
  const now = Date.now();

  // 5 mốc hủy trong 7 ngày; mốc gần nhất (lần thứ 5) sinh ra sự kiện phạt bên dưới
  const stamps = [
    new Date(now - 10 * 60 * 1000),
    new Date(now - 1 * HOUR),
    new Date(now - 2 * HOUR),
    new Date(now - 26 * HOUR),
    new Date(now - 50 * HOUR),
  ];
  const profile: Doc = {
    user_id: helperId,
    rating: 5,
    total_reviews: 12,
    completion_rate: 100,
    acceptance_rate: 100,
    verification_status: 'approved',
    service_ids: [new Types.ObjectId()],
    cancellation_timestamps: [...stamps],
    cancellations_last_7_days: 5,
    penalty_points: 10,
    performance_score: 50,
    score_breakdown: { distance: 0, skill: 30, rating: 20, kyc: 10 },
    score_updated_at: new Date(now - 10 * 60 * 1000),
    save: jest.fn(async () => profile),
  };

  const events: Doc[] = [
    {
      _id: new Types.ObjectId(),
      helper_id: helperId,
      source: 'job_cancel',
      job_id: new Types.ObjectId(),
      cancellations_in_window: 4,
      excess_count: 1,
      points_deducted: 5,
      performance_score_after: 95,
      status: 'active',
      created_at: new Date(now - 60 * HOUR),
    },
    {
      _id: new Types.ObjectId(),
      helper_id: helperId,
      source: 'sos_initiation',
      job_id: new Types.ObjectId(),
      cancellations_in_window: 5,
      excess_count: 2,
      points_deducted: 5,
      performance_score_after: 90,
      status: 'active',
      // Ghi ngay sau mốc hủy thứ 5 (~30 giây) — trong dung sai 5 phút của thuật toán gỡ mốc
      created_at: new Date(stamps[0]!.getTime() + 30 * 1000),
    },
    {
      _id: new Types.ObjectId(),
      helper_id: otherHelperId,
      source: 'job_cancel',
      job_id: new Types.ObjectId(),
      cancellations_in_window: 4,
      excess_count: 1,
      points_deducted: 5,
      performance_score_after: 95,
      status: 'active',
      created_at: new Date(now - 3 * HOUR),
    },
  ];

  const sosRequests: Doc[] = [
    {
      _id: new Types.ObjectId(),
      admin_attention: true,
      status: 'expired',
      original_helper_id: helperId,
      created_at: new Date(now - HOUR),
    },
    {
      _id: new Types.ObjectId(),
      admin_attention: false,
      status: 'accepted',
      original_helper_id: otherHelperId,
      created_at: new Date(now - 2 * HOUR),
    },
  ];

  const helperModel = {
    findOne: () => ({ exec: async () => profile }),
    find: (filter: Record<string, unknown>) => ({
      exec: async () => [profile].filter(p => matches(p, filter)),
    }),
  };
  const penaltyEventModel = {
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => ({
      exec: async () => {
        const found = events.find(e => matches(e, filter));
        if (!found) return null;
        applySet(found, update);
        return found;
      },
    }),
    findById: (id: string) => ({
      exec: async () => events.find(e => String(e._id) === String(id)) ?? null,
    }),
    find: (filter: Record<string, unknown>) => chainable(events.filter(e => matches(e, filter))),
    countDocuments: (filter: Record<string, unknown>) => ({
      exec: async () => events.filter(e => matches(e, filter)).length,
    }),
  };
  const sosModel = {
    find: (filter: Record<string, unknown>) =>
      chainable(sosRequests.filter(r => matches(r, filter))),
    countDocuments: (filter: Record<string, unknown>) => ({
      exec: async () => sosRequests.filter(r => matches(r, filter)).length,
    }),
  };

  const dummy = {} as never;
  const service = new AdminService(
    dummy, // userModel
    helperModel as never, // helperModel
    dummy, // jobModel
    dummy, // contractModel
    dummy, // notificationModel
    dummy, // walletModel
    dummy, // transactionModel
    dummy, // withdrawalModel
    dummy, // reviewModel
    dummy, // customerModel
    sosModel as never, // sosModel
    penaltyEventModel as never, // penaltyEventModel
    dummy, // notificationsService
    dummy, // paymentsService
    dummy, // jobsService
  );

  return { service, adminId, helperId, otherHelperId, profile, events, targetEvent: events[1]! };
}

describe('AdminService.waivePenaltyEvent', () => {
  it('miễn phạt: sự kiện → waived kèm audit, gỡ đúng 1 mốc hủy, điểm tính lại 50 → 55', async () => {
    const { service, adminId, profile, targetEvent } = makeService();

    const result = await service.waivePenaltyEvent(
      String(adminId),
      String(targetEvent._id),
      'Xe hỏng giữa đường — bất khả kháng có ảnh minh chứng',
    );

    expect(result.already_waived).toBe(false);
    const event = result.event as unknown as Doc;
    expect(event['status']).toBe('waived');
    expect(String(event['waived_by'])).toBe(String(adminId));
    expect(event['waived_at']).toBeInstanceOf(Date);
    expect(event['waive_reason']).toContain('bất khả kháng');
    // Số liệu lịch sử trên sự kiện giữ nguyên
    expect(event['points_deducted']).toBe(5);

    expect(profile['cancellation_timestamps'] as Date[]).toHaveLength(4);
    expect(profile['cancellations_last_7_days']).toBe(4);
    expect(profile['penalty_points']).toBe(5);
    expect(profile['performance_score']).toBe(55);
    expect(result.helper_score?.total).toBe(55);
    expect(result.helper_score?.penaltyPoints).toBe(5);
  });

  it('idempotent: miễn lại lần 2 → already_waived, KHÔNG gỡ thêm mốc, điểm giữ nguyên', async () => {
    const { service, adminId, profile, targetEvent } = makeService();

    await service.waivePenaltyEvent(String(adminId), String(targetEvent._id), 'lần 1');
    const second = await service.waivePenaltyEvent(
      String(adminId),
      String(targetEvent._id),
      'lần 2 — bấm trùng',
    );

    expect(second.already_waived).toBe(true);
    expect(profile['cancellation_timestamps'] as Date[]).toHaveLength(4);
    expect(profile['penalty_points']).toBe(5);
    expect(profile['performance_score']).toBe(55);
    expect(second.helper_score?.total).toBe(55);
  });

  it('sự kiện không tồn tại → NotFoundException', async () => {
    const { service, adminId } = makeService();
    await expect(
      service.waivePenaltyEvent(String(adminId), String(new Types.ObjectId()), 'x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminService — danh sách giám sát SOS', () => {
  it('getFlaggedSosRequests chỉ trả yêu cầu admin_attention = true, có phân trang', async () => {
    const { service } = makeService();
    const result = await service.getFlaggedSosRequests(1, 20);
    expect(result.total).toBe(1);
    expect(result.requests).toHaveLength(1);
    expect(result.total_pages).toBe(1);
  });

  it('getHelperPenaltyEvents lọc theo helper_id', async () => {
    const { service, helperId } = makeService();
    const result = await service.getHelperPenaltyEvents(String(helperId), undefined, 1, 20);
    expect(result.total).toBe(2);
    expect(result.events).toHaveLength(2);

    const all = await service.getHelperPenaltyEvents(undefined, undefined, 1, 20);
    expect(all.total).toBe(3);
  });

  it('R12 (mục 25): sổ phạt kèm ĐIỂM HIỆN TẠI của thợ — ảnh chụp lúc ghi giữ nguyên, điểm hiện tại lấy từ hồ sơ', async () => {
    const { service, helperId, otherHelperId } = makeService();
    const all = await service.getHelperPenaltyEvents(undefined, undefined, 1, 20);
    // Hồ sơ thợ (fixture): performance_score = 50 sau khi tính lại —
    // khác ảnh chụp lúc ghi của từng sự kiện (95 / 90), đúng như live.
    const mine = all.events.filter(
      e => String((e.helper_id as unknown as Types.ObjectId) ?? '') === String(helperId),
    );
    expect(mine).toHaveLength(2);
    for (const e of mine) {
      expect((e as unknown as Doc)['helper_current_score']).toBe(50);
      expect((e as unknown as Doc)['helper_current_penalty_points']).toBe(10);
      // Ảnh chụp lịch sử KHÔNG bị sửa
      expect((e as unknown as Doc)['performance_score_after']).toBeGreaterThan(50);
    }
    const others = all.events.filter(
      e => String((e.helper_id as unknown as Types.ObjectId) ?? '') === String(otherHelperId),
    );
    expect(others).toHaveLength(1);
    expect((others[0] as unknown as Doc)['helper_current_score']).toBeNull();
  });
});

describe('AdminService — nhật ký SOS đầy đủ (R12 mục 6)', () => {
  it('getSosBackupHistory trả MỌI yêu cầu (kể cả đã xử lý / admin_attention=false), mới nhất trước', async () => {
    const { service } = makeService();
    const result = await service.getSosBackupHistory(undefined, undefined, 1, 20);
    expect(result.total).toBe(2);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]!['status']).toBe('expired');
    expect(result.requests[1]!['status']).toBe('accepted');
  });

  it('getSosBackupHistory lọc theo trạng thái', async () => {
    const { service } = makeService();
    const result = await service.getSosBackupHistory('accepted', undefined, 1, 20);
    expect(result.total).toBe(1);
    expect(result.requests[0]!['status']).toBe('accepted');
  });

  it('getSosBackupHistory lọc theo thợ gốc', async () => {
    const { service, helperId } = makeService();
    const result = await service.getSosBackupHistory(undefined, String(helperId), 1, 20);
    expect(result.total).toBe(1);
    expect(result.requests[0]!['status']).toBe('expired');
  });

  it('getSosBackupHistory helper_id sai định dạng → 400', async () => {
    const { service } = makeService();
    await expect(service.getSosBackupHistory(undefined, 'khong-phai-objectid', 1, 20)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

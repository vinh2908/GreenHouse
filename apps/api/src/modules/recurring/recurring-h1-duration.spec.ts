import { Types } from 'mongoose';
import { RecurringService } from './recurring.service';
import { JobsService } from '../jobs/jobs.service';

/**
 * Spec H1 (R1): sinh đơn định kỳ map plan.duration_hours → estimated_duration.
 *
 * Không mock kết quả cần chứng minh: RecurringService chạy cùng JobsService
 * THẬT (validation G12/A9/A1/G3 thật trong createJob) — chỉ mock tầng model
 * (plan/job/user/service) và thông báo. Trước fix, plan wizard (chỉ có
 * time_start + duration_hours, không time_end) bị G12 chặn 400 mọi kỳ và
 * lỗi chỉ được logger.warn nuốt; sau fix các kỳ sinh được đơn thật.
 */
describe('RecurringService generateJobsForPlan (H1/R1 duration mapping)', () => {
  const customerId = new Types.ObjectId().toHexString();

  // Giờ địa phương, giống RecurringService.dateKey — toISOString() (UTC)
  // lệch 1 ngày khi chạy trước 07:00 giờ VN.
  function dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d: Date, days: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  function makeWorld() {
    const createdJobs: Record<string, any>[] = [];
    // JobModel của JobsService (tầng ghi đơn thật qua createJob).
    const jobsServiceJobModel: any = {
      create: jest.fn(async (doc: any) => {
        const job = { ...doc, _id: new Types.ObjectId() };
        createdJobs.push(job);
        return job;
      }),
    };
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
    const dummy = {} as never;
    const notificationsService: any = {
      create: jest.fn(async () => ({})),
      notifyAdmins: jest.fn(async () => ({})),
    };
    const jobsService = new JobsService(
      jobsServiceJobModel,
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
    (jobsService as any).notifyNearbyHelpers = jest.fn(async () => undefined);

    // Model của RecurringService: chưa có đơn nào cho kỳ nào.
    const recurringJobModel: any = {
      exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };
    const planModel: any = {
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };
    const service = new RecurringService(
      planModel,
      recurringJobModel,
      dummy, // helperModel — không dùng khi gói không có thợ quen
      jobsService,
      dummy, // favoritesService — không dùng khi gói không có thợ quen
      notificationsService,
    );
    return { service, jobsServiceJobModel, createdJobs };
  }

  /** Gói weekly mẫu: lượt đầu tiên là ngày kia (chắc chắn trong tương lai). */
  function weeklyPlan(overrides: Record<string, unknown> = {}) {
    const today = startOfDay(new Date());
    const first = addDays(today, 2);
    return {
      _id: new Types.ObjectId(),
      customer_id: new Types.ObjectId(customerId),
      service_id: new Types.ObjectId(),
      title: 'Dọn nhà định kỳ',
      description: 'Dọn hàng tuần',
      photos: [],
      address: {
        full_address: '123 Lê Lợi',
        ward: 'Hải Châu',
        district: 'Hải Châu',
        city: 'Đà Nẵng',
        location: { type: 'Point', coordinates: [108.2, 16.05] },
      },
      frequency: 'weekly',
      weekdays: [first.getDay()],
      month_days: [],
      time_start: '09:00',
      time_end: undefined,
      duration_hours: 2,
      start_date: addDays(today, -7),
      end_date: undefined,
      status: 'active',
      skipped_dates: [],
      jobs_generated: 0,
      preferred_helper_id: undefined,
      ...overrides,
    } as never;
  }

  /** Các kỳ weekly trong cửa sổ 14 ngày của gói weeklyPlan(): ngày kia + tuần sau. */
  function weeklyOccurrenceKeys(): string[] {
    const today = startOfDay(new Date());
    return [dateKey(addDays(today, 2)), dateKey(addDays(today, 9))];
  }

  it('weekly chỉ có time_start + duration_hours → sinh được đơn, estimated_duration = 2, không 400', async () => {
    const { service, jobsServiceJobModel, createdJobs } = makeWorld();
    const plan: any = weeklyPlan();

    const created = await service.generateJobsForPlan(plan);

    const expectedKeys = weeklyOccurrenceKeys();
    expect(created).toBe(2);
    expect(jobsServiceJobModel.create).toHaveBeenCalledTimes(2);
    expect(createdJobs.map(j => j.occurrence_date).sort()).toEqual(expectedKeys);
    for (const job of createdJobs) {
      expect(job.estimated_duration).toBe(2);
      expect(job.preferred_time_start).toBe('09:00');
      expect(job.preferred_time_end).toBeUndefined();
      expect(String(job.recurring_plan_id)).toBe(String(plan._id));
    }
    expect(plan.jobs_generated).toBe(2);
  });

  it('weekly có đủ cặp giờ + duration_hours → ưu tiên cặp giờ, không gắn estimated_duration', async () => {
    const { service, createdJobs } = makeWorld();
    const plan: any = weeklyPlan({ time_end: '11:00', duration_hours: 2 });

    const created = await service.generateJobsForPlan(plan);

    expect(created).toBe(2);
    expect(createdJobs).toHaveLength(2);
    for (const job of createdJobs) {
      expect(job.estimated_duration).toBeUndefined();
      expect(job.preferred_time_start).toBe('09:00');
      expect(job.preferred_time_end).toBe('11:00');
    }
  });

  it("time_end chuỗi rỗng + duration_hours → coi như thiếu time_end, dùng duration_hours", async () => {
    const { service, createdJobs } = makeWorld();
    const plan: any = weeklyPlan({ time_end: '', duration_hours: 3 });

    const created = await service.generateJobsForPlan(plan);

    expect(created).toBe(2);
    for (const job of createdJobs) {
      expect(job.estimated_duration).toBe(3);
    }
  });

  it('duration_hours lẻ 2.5 → map nguyên giá trị', async () => {
    const { service, createdJobs } = makeWorld();
    const plan: any = weeklyPlan({ duration_hours: 2.5 });

    const created = await service.generateJobsForPlan(plan);

    expect(created).toBe(2);
    for (const job of createdJobs) {
      expect(job.estimated_duration).toBe(2.5);
    }
  });

  it('monthly chỉ có time_start + duration_hours → sinh được đơn', async () => {
    const { service, createdJobs } = makeWorld();
    const today = startOfDay(new Date());
    const first = addDays(today, 2);
    const plan: any = weeklyPlan({
      frequency: 'monthly',
      weekdays: [],
      month_days: [first.getDate()],
    });

    const created = await service.generateJobsForPlan(plan);

    expect(created).toBe(1);
    expect(createdJobs).toHaveLength(1);
    expect(createdJobs[0].estimated_duration).toBe(2);
    expect(createdJobs[0].occurrence_date).toBe(dateKey(first));
  });

  it('không time_end, không duration_hours → sinh 0 đơn, không throw (G12 400 được nuốt + log như cũ)', async () => {
    const { service, jobsServiceJobModel } = makeWorld();
    const plan: any = weeklyPlan({ duration_hours: undefined });

    const created = await service.generateJobsForPlan(plan);

    expect(created).toBe(0);
    expect(jobsServiceJobModel.create).not.toHaveBeenCalled();
  });

  it('duration_hours 0.2 (< 0,5) → G12 chặn, sinh 0 đơn, không throw', async () => {
    const { service, jobsServiceJobModel } = makeWorld();
    const plan: any = weeklyPlan({ duration_hours: 0.2 });

    const created = await service.generateJobsForPlan(plan);

    expect(created).toBe(0);
    expect(jobsServiceJobModel.create).not.toHaveBeenCalled();
  });

  it('time_end sai định dạng + duration_hours → không fallback (cặp giờ có mặt thì không dùng duration), sinh 0 đơn', async () => {
    const { service, jobsServiceJobModel } = makeWorld();
    const plan: any = weeklyPlan({ time_end: 'abc', duration_hours: 2 });

    const created = await service.generateJobsForPlan(plan);

    expect(created).toBe(0);
    expect(jobsServiceJobModel.create).not.toHaveBeenCalled();
  });

  it('đơn định kỳ quá khứ vẫn bỏ qua như cũ (kỳ hôm nay đã qua giờ, gói hết hạn hôm nay)', async () => {
    const { service, jobsServiceJobModel } = makeWorld();
    const today = startOfDay(new Date());
    const plan: any = weeklyPlan({
      weekdays: [today.getDay()],
      time_start: '00:01',
      end_date: today,
    });

    const created = await service.generateJobsForPlan(plan);

    expect(created).toBe(0);
    expect(jobsServiceJobModel.create).not.toHaveBeenCalled();
    expect(plan.jobs_generated).toBe(0);
  });

  it('lượt hôm nay đã qua giờ thì bỏ qua, lượt tuần sau vẫn sinh', async () => {
    const { service, createdJobs } = makeWorld();
    const today = startOfDay(new Date());
    const todayOccurrence = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      9,
      0,
      0,
      0,
    );
    const todayPast = todayOccurrence.getTime() <= Date.now();
    const plan: any = weeklyPlan({
      weekdays: [today.getDay()],
      time_start: '09:00',
    });

    const created = await service.generateJobsForPlan(plan);

    const expectedKeys = [
      dateKey(addDays(today, 7)),
      dateKey(addDays(today, 14)),
      ...(todayPast ? [] : [dateKey(today)]),
    ].sort();
    expect(created).toBe(expectedKeys.length);
    expect(createdJobs.map(j => j.occurrence_date).sort()).toEqual(expectedKeys);
    for (const job of createdJobs) {
      expect(job.estimated_duration).toBe(2);
    }
  });
});

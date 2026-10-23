import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RecurringPlan,
  RecurringPlanDocument,
  RecurringFrequency,
  RecurringPlanStatus,
} from './schemas/recurring-plan.schema';
import { CreateRecurringPlanDto, UpdateRecurringPlanDto } from './dto/recurring.dto';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { CreateJobDto } from '../jobs/dto/job.dto';
import { JobsService, isAvailableForDate } from '../jobs/jobs.service';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { FavoritesService } from '../favorites/favorites.service';
import { JobStatus } from '@homemate/types';
import { RECURRING_WINDOW_DAYS } from '@homemate/constants';

/**
 * Gói định kỳ: hệ thống tự sinh Job riêng lẻ trước mỗi lượt theo cửa sổ trượt
 * (rolling window) RECURRING_WINDOW_DAYS ngày. Việc sinh job chạy:
 *  - ngay khi tạo / resume / sửa lịch / bỏ qua lượt
 *  - mỗi giờ 1 lần qua interval trong OnApplicationBootstrap (không cần cron lib)
 */
@Injectable()
export class RecurringService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RecurringService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(RecurringPlan.name)
    private planModel: Model<RecurringPlanDocument>,
    @InjectModel(Job.name)
    private jobModel: Model<JobDocument>,
    @InjectModel(HelperProfile.name)
    private helperModel: Model<HelperProfileDocument>,
    private readonly jobsService: JobsService,
    private readonly favoritesService: FavoritesService,
  ) {}

  // ─── Scheduler (interval 1 giờ, chạy 1 lần khi API khởi động) ─────────────

  onApplicationBootstrap() {
    this.generateForAllActivePlans().catch(err =>
      this.logger.error(`Recurring generation failed at bootstrap: ${err?.message ?? err}`),
    );
    this.timer = setInterval(
      () => {
        this.generateForAllActivePlans().catch(err =>
          this.logger.error(`Recurring generation failed: ${err?.message ?? err}`),
        );
      },
      60 * 60 * 1000,
    );
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async generateForAllActivePlans(): Promise<void> {
    const plans = await this.planModel.find({ status: RecurringPlanStatus.ACTIVE }).exec();
    for (const plan of plans) {
      try {
        await this.generateJobsForPlan(plan);
      } catch (err) {
        this.logger.warn(
          `Could not generate jobs for plan ${String(plan._id)}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  // ─── Date helpers (giờ địa phương của server) ─────────────────────────────

  private dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private addDays(d: Date, days: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  /** Danh sách ngày 'YYYY-MM-DD' các lượt diễn ra trong [from, to] (đã áp start/end date) */
  private occurrenceDates(plan: RecurringPlan, from: Date, to: Date): string[] {
    const dates: string[] = [];
    const start = this.startOfDay(plan.start_date);
    const end = plan.end_date ? this.startOfDay(plan.end_date) : null;
    const rangeStart = this.startOfDay(from) < start ? start : this.startOfDay(from);
    const rangeEnd = this.startOfDay(to);

    if (plan.frequency === RecurringFrequency.WEEKLY) {
      const weekdays = new Set(plan.weekdays ?? []);
      for (let d = new Date(rangeStart); d <= rangeEnd; d = this.addDays(d, 1)) {
        if (end && d > end) break;
        if (weekdays.has(d.getDay())) dates.push(this.dateKey(d));
      }
    } else {
      const monthDays = [...(plan.month_days ?? [])].sort((a, b) => a - b);
      const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      const lastMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
      while (cursor <= lastMonth) {
        const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        for (const md of monthDays) {
          const day = Math.min(md, lastDay);
          const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          if (candidate >= rangeStart && candidate <= rangeEnd && (!end || candidate <= end)) {
            dates.push(this.dateKey(candidate));
          }
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
      dates.sort();
    }
    return dates;
  }

  private nextOccurrenceDate(plan: RecurringPlan, from: Date): Date | undefined {
    const now = new Date();
    const upcoming = this.occurrenceDates(plan, from, this.addDays(from, 370)).filter(
      key => !plan.skipped_dates?.includes(key),
    );
    if (upcoming.length === 0) return undefined;
    const [hh, mm] = (plan.time_start || '09:00').split(':').map(Number);
    for (const dateKey of upcoming) {
      const [y, m, d] = dateKey.split('-').map(Number);
      const cand = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0, 0, 0);
      if (cand.getTime() > now.getTime()) {
        return cand;
      }
    }
    return undefined;
  }

  // ─── Sinh job cho các lượt sắp tới của 1 gói ──────────────────────────────

  async generateJobsForPlan(plan: RecurringPlanDocument): Promise<number> {
    if (plan.status !== RecurringPlanStatus.ACTIVE) return 0;

    const today = this.startOfDay(new Date());
    const windowEnd = this.addDays(today, RECURRING_WINDOW_DAYS);
    const dates = this.occurrenceDates(plan, today, windowEnd).filter(
      key => !plan.skipped_dates.includes(key),
    );

    // Lịch làm việc (Feature 13): nếu gói có thợ quen, nạp lịch của thợ 1 lần;
    // lượt nào thợ không làm (ngày nghỉ / ngoài giờ / ngày chặn) thì lượt đó
    // được tạo CÔNG KHAI thay vì gửi riêng cho thợ.
    let preferredHelperAvailability: HelperProfileDocument['availability'] | undefined;
    if (plan.preferred_helper_id) {
      const profile = await this.helperModel
        .findOne({ user_id: plan.preferred_helper_id })
        .select('availability')
        .lean()
        .exec();
      preferredHelperAvailability = profile?.availability;
    }

    let created = 0;
    for (const key of dates) {
      const exists = await this.jobModel
        .exists({ recurring_plan_id: plan._id, occurrence_date: key })
        .exec();
      if (exists) continue;

      const dto: CreateJobDto = {
        service_id: String(plan.service_id),
        title: plan.title,
        description: plan.description,
        photos: plan.photos,
        address: {
          full_address: plan.address.full_address,
          ward: plan.address.ward,
          district: plan.address.district,
          city: plan.address.city,
          notes: plan.address.notes,
          location: {
            type: 'Point',
            coordinates: plan.address.location.coordinates,
          } as CreateJobDto['address']['location'],
        },
        preferred_date: key,
        preferred_time_start: plan.time_start,
        preferred_time_end: plan.time_end,
        is_flexible_time: false,
      };

      const helperAvailableForOccurrence = plan.preferred_helper_id
        ? isAvailableForDate(preferredHelperAvailability, key, plan.time_start)
        : true;

      try {
        await this.jobsService.createJob(String(plan.customer_id), dto, {
          recurringPlanId: String(plan._id),
          occurrenceDate: key,
          privateOfferHelperId:
            plan.preferred_helper_id && helperAvailableForOccurrence
              ? String(plan.preferred_helper_id)
              : undefined,
          skipFavoriteCheck: true,
        });
        created += 1;
      } catch (err) {
        // VD: thợ quen chưa xác thực e-KYC → thử lại không kèm ưu tiên riêng
        if (plan.preferred_helper_id) {
          this.logger.warn(
            `Plan ${String(plan._id)}: private offer failed (${err instanceof Error ? err.message : err}); creating public job instead`,
          );
          await this.jobsService.createJob(String(plan.customer_id), dto, {
            recurringPlanId: String(plan._id),
            occurrenceDate: key,
          });
          created += 1;
        } else {
          throw err;
        }
      }
    }

    const updates: Record<string, unknown> = {
      next_occurrence_at: this.nextOccurrenceDate(plan, new Date()),
    };
    if (created > 0) updates['jobs_generated'] = (plan.jobs_generated ?? 0) + created;
    await this.planModel.findByIdAndUpdate(plan._id, { $set: updates }).exec();
    Object.assign(plan, updates);
    return created;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  private validateSchedule(dto: {
    frequency?: string;
    weekdays?: number[];
    month_days?: number[];
  }) {
    if (dto.frequency === 'weekly' && (!dto.weekdays || dto.weekdays.length === 0)) {
      throw new BadRequestException('Gói hàng tuần cần chọn ít nhất 1 thứ trong tuần');
    }
    if (dto.frequency === 'monthly' && (!dto.month_days || dto.month_days.length === 0)) {
      throw new BadRequestException('Gói hàng tháng cần chọn ít nhất 1 ngày trong tháng');
    }
  }

  private async validatePreferredHelper(customerId: string, helperId?: string) {
    if (!helperId) return;
    const isFav = await this.favoritesService.isFavorite(customerId, helperId);
    if (!isFav) {
      throw new BadRequestException(
        'Thợ quen của gói phải nằm trong danh sách Yêu thích của bạn. Hãy thêm thợ vào Yêu thích trước.',
      );
    }
    if (!(await this.jobsService.isVerifiedHelper(helperId))) {
      throw new BadRequestException('Thợ quen chưa hoàn tất xác thực e-KYC');
    }
  }

  async createPlan(
    customerId: string,
    dto: CreateRecurringPlanDto,
  ): Promise<RecurringPlanDocument> {
    this.validateSchedule(dto);
    await this.validatePreferredHelper(customerId, dto.preferred_helper_id);

    const startDate = new Date(dto.start_date);
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('start_date không hợp lệ');
    }

    const plan = await this.planModel.create({
      customer_id: new Types.ObjectId(customerId),
      service_id: new Types.ObjectId(dto.service_id),
      title: dto.title,
      description: dto.description,
      photos: dto.photos ?? [],
      address: {
        full_address: dto.address.full_address,
        ward: dto.address.ward,
        district: dto.address.district,
        city: dto.address.city,
        notes: dto.address.notes,
        location: { type: 'Point', coordinates: dto.address.location.coordinates },
      },
      frequency: dto.frequency,
      weekdays: dto.frequency === 'weekly' ? [...new Set(dto.weekdays ?? [])] : [],
      month_days: dto.frequency === 'monthly' ? [...new Set(dto.month_days ?? [])] : [],
      time_start: dto.time_start,
      time_end: dto.time_end,
      duration_hours: dto.duration_hours,
      start_date: startDate,
      end_date: dto.end_date ? new Date(dto.end_date) : undefined,
      preferred_helper_id: dto.preferred_helper_id
        ? new Types.ObjectId(dto.preferred_helper_id)
        : undefined,
      status: RecurringPlanStatus.ACTIVE,
      skipped_dates: [],
    });

    await this.generateJobsForPlan(plan);
    return plan;
  }

  async listMyPlans(customerId: string) {
    const plans = await this.planModel
      .find({ customer_id: new Types.ObjectId(customerId) })
      .populate('service_id', 'name slug icon')
      .populate('preferred_helper_id', 'full_name avatar')
      .sort({ created_at: -1 })
      .exec();

    const now = new Date();
    return plans.map(p => {
      const obj = p.toObject();
      if (obj.status === RecurringPlanStatus.ACTIVE) {
        const nextDate = this.nextOccurrenceDate(p, now);
        if (nextDate) {
          obj.next_occurrence_at = nextDate;
        }
      }
      return obj;
    });
  }

  private async getOwnedPlan(customerId: string, planId: string): Promise<RecurringPlanDocument> {
    const plan = await this.planModel.findById(planId).exec();
    if (!plan) throw new NotFoundException('Gói định kỳ không tồn tại');
    if (plan.customer_id.toString() !== customerId) throw new ForbiddenException();
    return plan;
  }

  async getPlanDetail(customerId: string, planId: string) {
    const plan = await this.getOwnedPlan(customerId, planId);
    const jobs = await this.jobModel
      .find({ recurring_plan_id: plan._id })
      .sort({ occurrence_date: 1 })
      .limit(50)
      .exec();
    const now = new Date();
    const upcomingDates = this.occurrenceDates(plan, now, this.addDays(now, 62))
      .filter(key => !plan.skipped_dates.includes(key))
      .filter(key => {
        const [y, m, d] = key.split('-').map(Number);
        const [hh, mm] = (plan.time_start || '09:00').split(':').map(Number);
        return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0, 0, 0).getTime() > now.getTime();
      })
      .slice(0, 5);
    const populated = await plan.populate([
      { path: 'service_id', select: 'name slug icon' },
      { path: 'preferred_helper_id', select: 'full_name avatar' },
    ]);
    const obj = populated.toObject();
    if (obj.status === RecurringPlanStatus.ACTIVE) {
      const nextDate = this.nextOccurrenceDate(plan, now);
      if (nextDate) obj.next_occurrence_at = nextDate;
    }
    return { plan: obj, jobs, upcoming_dates: upcomingDates };
  }

  async updatePlan(
    customerId: string,
    planId: string,
    dto: UpdateRecurringPlanDto,
  ): Promise<RecurringPlanDocument> {
    const plan = await this.getOwnedPlan(customerId, planId);
    if (plan.status === RecurringPlanStatus.CANCELLED) {
      throw new BadRequestException('Gói đã hủy, không thể chỉnh sửa');
    }

    const next = {
      frequency: dto.frequency ?? plan.frequency,
      weekdays: dto.weekdays ?? plan.weekdays,
      month_days: dto.month_days ?? plan.month_days,
    };
    this.validateSchedule(next);

    if (dto.title) plan.title = dto.title;
    if (dto.description) plan.description = dto.description;
    if (dto.frequency) plan.frequency = dto.frequency as RecurringFrequency;
    if (dto.weekdays) plan.weekdays = [...new Set(dto.weekdays)];
    if (dto.month_days) plan.month_days = [...new Set(dto.month_days)];
    if (dto.time_start) plan.time_start = dto.time_start;
    if (dto.time_end !== undefined) plan.time_end = dto.time_end;
    if (dto.end_date) plan.end_date = new Date(dto.end_date);
    if (dto.preferred_helper_id !== undefined) {
      await this.validatePreferredHelper(customerId, dto.preferred_helper_id ?? undefined);
      plan.preferred_helper_id = dto.preferred_helper_id
        ? new Types.ObjectId(dto.preferred_helper_id)
        : undefined;
    }
    await plan.save();

    // Lịch thay đổi chỉ áp dụng cho các lượt CHƯA sinh job
    if (plan.status === RecurringPlanStatus.ACTIVE) {
      await this.generateJobsForPlan(plan);
    }
    return plan;
  }

  async pausePlan(customerId: string, planId: string): Promise<RecurringPlanDocument> {
    const plan = await this.getOwnedPlan(customerId, planId);
    if (plan.status !== RecurringPlanStatus.ACTIVE) {
      throw new BadRequestException('Chỉ có thể tạm dừng gói đang hoạt động');
    }
    plan.status = RecurringPlanStatus.PAUSED;
    await plan.save();
    return plan;
  }

  async resumePlan(customerId: string, planId: string): Promise<RecurringPlanDocument> {
    const plan = await this.getOwnedPlan(customerId, planId);
    if (plan.status !== RecurringPlanStatus.PAUSED) {
      throw new BadRequestException('Chỉ có thể tiếp tục gói đang tạm dừng');
    }
    plan.status = RecurringPlanStatus.ACTIVE;
    await plan.save();
    await this.generateJobsForPlan(plan);
    return plan;
  }

  async skipNext(customerId: string, planId: string): Promise<RecurringPlanDocument> {
    const plan = await this.getOwnedPlan(customerId, planId);
    if (plan.status === RecurringPlanStatus.CANCELLED) {
      throw new BadRequestException('Gói đã hủy');
    }

    const today = this.startOfDay(new Date());
    const upcoming = this.occurrenceDates(plan, today, this.addDays(today, 370)).filter(
      key => !plan.skipped_dates.includes(key),
    );
    if (upcoming.length === 0) {
      throw new BadRequestException('Không còn lượt nào sắp tới để bỏ qua');
    }
    const nextKey = upcoming[0];

    const existingJob = await this.jobModel
      .findOne({ recurring_plan_id: plan._id, occurrence_date: nextKey })
      .exec();
    if (existingJob && ![JobStatus.OPEN, JobStatus.RECEIVING_QUOTES].includes(existingJob.status)) {
      throw new BadRequestException(
        'Buổi gần nhất đã có thợ nhận/đang thực hiện, không thể bỏ qua. Hãy mở đơn đó để hủy trực tiếp.',
      );
    }

    plan.skipped_dates.push(nextKey);
    await plan.save();

    if (existingJob) {
      await this.jobsService.cancelJob(customerId, 'customer', String(existingJob._id), {
        reason: 'Khách bỏ qua buổi định kỳ này',
      });
    }
    if (plan.status === RecurringPlanStatus.ACTIVE) {
      await this.generateJobsForPlan(plan);
    }
    const refreshed = await this.planModel.findById(plan._id).exec();
    return refreshed ?? plan;
  }

  async cancelPlan(customerId: string, planId: string): Promise<RecurringPlanDocument> {
    const plan = await this.getOwnedPlan(customerId, planId);
    if (plan.status === RecurringPlanStatus.CANCELLED) {
      throw new BadRequestException('Gói đã được hủy trước đó');
    }
    plan.status = RecurringPlanStatus.CANCELLED;
    await plan.save();

    // Hủy các job tương lai chưa có thợ chốt
    const todayKey = this.dateKey(new Date());
    const futureJobs = await this.jobModel
      .find({
        recurring_plan_id: plan._id,
        occurrence_date: { $gte: todayKey },
        status: { $in: [JobStatus.OPEN, JobStatus.RECEIVING_QUOTES] },
      })
      .exec();
    for (const job of futureJobs) {
      await this.jobsService
        .cancelJob(customerId, 'customer', String(job._id), { reason: 'Khách hủy gói định kỳ' })
        .catch(() => undefined);
    }
    return plan;
  }
}

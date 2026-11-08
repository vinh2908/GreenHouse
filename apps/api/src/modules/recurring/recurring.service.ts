import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
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
import { User, UserDocument } from '../users/schemas/user.schema';
import { FavoritesService } from '../favorites/favorites.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobStatus } from '@homemate/types';
import { NOTIFICATION_TYPES } from '@homemate/constants';
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
    private readonly notificationsService: NotificationsService,
    @Optional()
    @InjectModel(User.name)
    private userModel?: Model<UserDocument>,
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

  // ─── Date helpers (chuẩn hoá theo múi giờ Việt Nam Asia/Ho_Chi_Minh UTC+7) ──────

  private toVnDate(d: Date): Date {
    return new Date(d.getTime() + 7 * 60 * 60 * 1000);
  }

  private dateKey(d: Date): string {
    const vn = this.toVnDate(d);
    const y = vn.getUTCFullYear();
    const m = String(vn.getUTCMonth() + 1).padStart(2, '0');
    const day = String(vn.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private startOfDay(d: Date): Date {
    const key = this.dateKey(d);
    return new Date(`${key}T00:00:00+07:00`);
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
        const vnDay = this.toVnDate(d).getUTCDay();
        if (weekdays.has(vnDay)) dates.push(this.dateKey(d));
      }
    } else {
      const startKey = this.dateKey(rangeStart);
      const endLimitKey = end ? this.dateKey(end) : null;
      const rangeEndKey = this.dateKey(rangeEnd);

      const monthDays = [...(plan.month_days ?? [])].sort((a, b) => a - b);
      const [startYear, startMonth] = startKey.split('-').map(Number);
      const [endYear, endMonth] = rangeEndKey.split('-').map(Number);

      let curY = startYear;
      let curM = startMonth;
      while (curY < endYear || (curY === endYear && curM <= endMonth)) {
        const lastDay = new Date(Date.UTC(curY, curM, 0)).getUTCDate();
        const yStr = String(curY);
        const mStr = String(curM).padStart(2, '0');
        for (const md of monthDays) {
          // H5: Bỏ qua tháng không có ngày tương ứng (ví dụ ngày 31 ở tháng 2 hoặc tháng 30 ngày), không dời kẹp lặng
          if (md > lastDay) {
            continue;
          }
          const day = md;
          const dStr = String(day).padStart(2, '0');
          const candKey = `${yStr}-${mStr}-${dStr}`;
          if (
            candKey >= startKey &&
            candKey <= rangeEndKey &&
            (!endLimitKey || candKey <= endLimitKey)
          ) {
            dates.push(candKey);
          }
        }
        curM++;
        if (curM > 12) {
          curM = 1;
          curY++;
        }
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
    for (const dateKey of upcoming) {
      const cand = new Date(`${dateKey}T${plan.time_start || '09:00'}:00+07:00`);
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

    // K13(d) & H5: Cảnh báo cho khách khi tháng trong rolling window bị bỏ qua do không có ngày tương ứng (ví dụ ngày 31)
    if (plan.frequency === RecurringFrequency.MONTHLY && plan.month_days?.length) {
      const sortedMonthDays = [...plan.month_days].sort((a, b) => a - b);
      const [startYear, startMonth] = this.dateKey(today).split('-').map(Number);
      const [endYear, endMonth] = this.dateKey(windowEnd).split('-').map(Number);
      let curY = startYear;
      let curM = startMonth;
      while (curY < endYear || (curY === endYear && curM <= endMonth)) {
        const lastDay = new Date(Date.UTC(curY, curM, 0)).getUTCDate();
        for (const md of sortedMonthDays) {
          if (md > lastDay) {
            const skipKey = `skip_warn_${curY}-${String(curM).padStart(2, '0')}-${md}`;
            // O7(c): Tách riêng marker cảnh báo vào warning_notifications_sent, không lưu chung vào mảng skipped_dates của khách
            const alreadyNotified =
              (plan as any).warning_notifications_sent?.includes(skipKey) ||
              plan.skipped_dates?.includes(skipKey);
            if (!alreadyNotified) {
              await this.notificationsService
                ?.create({
                  userId: String(plan.customer_id),
                  type: NOTIFICATION_TYPES.SYSTEM,
                  title: 'Lịch định kỳ: Bỏ qua lượt trong tháng',
                  body: `Tháng ${curM}/${curY} không có ngày ${md} nên lịch định kỳ "${plan.title}" tự động bỏ qua lượt này.`,
                  payload: { plan_id: String(plan._id), year: curY, month: curM, day: md },
                })
                .catch(() => undefined);

              if (this.planModel) {
                await this.planModel
                  .updateOne(
                    { _id: plan._id },
                    {
                      $push: {
                        warning_notifications_sent: {
                          $each: [skipKey],
                          $slice: -60,
                        },
                      },
                    },
                  )
                  .catch(() => undefined);
              }
              const warnList = ((plan as any).warning_notifications_sent =
                (plan as any).warning_notifications_sent || []);
              warnList.push(skipKey);
              if (warnList.length > 60) {
                (plan as any).warning_notifications_sent = warnList.slice(-60);
              }
            }
          }
        }
        curM++;
        if (curM > 12) {
          curM = 1;
          curY++;
        }
      }
    }

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
    const now = new Date();
    for (const key of dates) {
      const exists = await this.jobModel
        .exists({ recurring_plan_id: plan._id, occurrence_date: key })
        .exec();
      if (exists) continue;

      const [hh, mm] = (plan.time_start || '09:00').split(':').map(Number);
      const [y, m, d] = key.split('-').map(Number);
      const occurrenceDateTime = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0, 0, 0);
      if (occurrenceDateTime.getTime() <= now.getTime()) {
        this.logger.log(
          `Skipping past occurrence date ${key} ${plan.time_start} for plan ${plan._id}`,
        );
        continue;
      }

      // H1 (R1): Gói wizard chỉ gửi time_start + duration_hours, không có
      // time_end — map duration_hours → estimated_duration để G12 ở
      // createJob không chặn 400 mọi kỳ. Có đủ cặp giờ thì ưu tiên cặp giờ
      // như cũ (không gắn estimated_duration, A9 vẫn kiểm tra cặp giờ);
      // chỉ dùng duration_hours khi thiếu time_end (undefined/null/chuỗi
      // rỗng — chuỗi rỗng cũng làm hasTimeRange của G12 sai nên tính là
      // thiếu). duration_hours không phải số hữu hạn thì không map: G12 sẽ
      // 400 với thông báo chung thay vì nhận giá trị rác.
      const hasTimeEnd = typeof plan.time_end === 'string' && plan.time_end.trim() !== '';
      const durationHours =
        typeof plan.duration_hours === 'number' && Number.isFinite(plan.duration_hours)
          ? plan.duration_hours
          : undefined;

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
        ...(!hasTimeEnd && durationHours !== undefined
          ? { estimated_duration: durationHours }
          : {}),
        is_flexible_time: false,
      };

      const helperAvailableForOccurrence = plan.preferred_helper_id
        ? isAvailableForDate(preferredHelperAvailability, key, plan.time_start)
        : true;

      // A79: Nếu thợ ưa thích bận -> báo cho khách biết đơn chuyển công khai
      if (plan.preferred_helper_id && !helperAvailableForOccurrence) {
        await this.notificationsService
          .create({
            userId: String(plan.customer_id),
            type: NOTIFICATION_TYPES.RECURRING_JOB_CREATED,
            title: 'Đơn định kỳ đã chuyển công khai',
            body: 'Thợ ưa thích đang bận, đơn đã chuyển công khai để các thợ khác nhận việc.',
            payload: { plan_id: String(plan._id), occurrence_date: key },
          })
          .catch(() => undefined);
      }

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

        // A79: Thông báo bền cho khách khi đơn định kỳ tự sinh
        await this.notificationsService
          .create({
            userId: String(plan.customer_id),
            type: NOTIFICATION_TYPES.RECURRING_JOB_CREATED,
            title: 'Đơn định kỳ đã được tạo',
            body: `Đơn định kỳ cho ngày ${key} đã được tạo thành công: "${plan.title}".`,
            payload: { plan_id: String(plan._id), occurrence_date: key },
          })
          .catch(() => undefined);
      } catch (err) {
        // VD: thợ quen chưa xác thực e-KYC → thử lại không kèm ưu tiên riêng
        if (plan.preferred_helper_id) {
          this.logger.warn(
            `Plan ${String(plan._id)}: private offer failed (${err instanceof Error ? err.message : err}); creating public job instead`,
          );
          try {
            await this.jobsService.createJob(String(plan.customer_id), dto, {
              recurringPlanId: String(plan._id),
              occurrenceDate: key,
            });
            created += 1;

            // A79: Báo cho khách biết đã chuyển công khai do lỗi gửi riêng
            await this.notificationsService
              .create({
                userId: String(plan.customer_id),
                type: NOTIFICATION_TYPES.RECURRING_JOB_CREATED,
                title: 'Đơn định kỳ đã chuyển công khai',
                body: 'Thợ ưa thích đang bận, đơn đã chuyển công khai để các thợ khác nhận việc.',
                payload: { plan_id: String(plan._id), occurrence_date: key },
              })
              .catch(() => undefined);
          } catch (pubErr) {
            this.logger.warn(
              `Plan ${String(plan._id)}: public job creation failed for date ${key}: ${pubErr instanceof Error ? pubErr.message : pubErr}`,
            );
          }
        } else {
          this.logger.warn(
            `Plan ${String(plan._id)}: job creation failed for date ${key}: ${err instanceof Error ? err.message : err}`,
          );
          // P1-16: Báo cho khách biết khi lượt trong ngày bị lỗi thay vì bỏ qua trong im lặng
          await this.notificationsService
            .create({
              userId: String(plan.customer_id),
              type: NOTIFICATION_TYPES.SYSTEM,
              title: 'Lịch định kỳ chưa thể tạo đơn',
              body: `Hệ thống chưa thể tạo đơn cho lịch định kỳ ngày ${key} ("${plan.title}"): ${err instanceof Error ? err.message : String(err)}. Vui lòng kiểm tra lại cấu hình gói!`,
              payload: { plan_id: String(plan._id), occurrence_date: key },
            })
            .catch(() => undefined);
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
    time_start?: string;
  }) {
    if (dto.frequency === 'weekly' && (!dto.weekdays || dto.weekdays.length === 0)) {
      throw new BadRequestException('Gói hàng tuần cần chọn ít nhất 1 thứ trong tuần');
    }
    if (dto.frequency === 'monthly' && (!dto.month_days || dto.month_days.length === 0)) {
      throw new BadRequestException('Gói hàng tháng cần chọn ít nhất 1 ngày trong tháng');
    }
    // P3-9 & H1: Giờ làm việc trong khung 07:00–22:00, từ chối định dạng sai
    if (dto.time_start) {
      const match = dto.time_start.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!match) {
        throw new BadRequestException('Định dạng giờ không hợp lệ (HH:mm)');
      }
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        throw new BadRequestException('Định dạng giờ không hợp lệ (HH:mm)');
      }
      const min = h * 60 + m;
      if (min < 7 * 60 || min > 22 * 60) {
        throw new BadRequestException('Giờ làm việc định kỳ phải trong khung 07:00–22:00');
      }
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
    // P2-20: Chặn tạo gói định kỳ khi tài khoản chưa xác minh email
    if (this.userModel?.findById) {
      const user = await this.userModel.findById(customerId).select('is_verified').lean().exec();
      if (user && user.is_verified === false) {
        throw new BadRequestException(
          'Tài khoản chưa được xác minh qua email. Vui lòng xác minh email trước khi tạo gói định kỳ.',
        );
      }
    }

    this.validateSchedule(dto);
    await this.validatePreferredHelper(customerId, dto.preferred_helper_id);

    // P3-9 & H1: Không cho ngày bắt đầu trong quá khứ (không chặn bởi NODE_ENV !== test)
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayVnStr = vnNow.toISOString().slice(0, 10);
    const startDateStr = typeof dto.start_date === 'string' ? dto.start_date.slice(0, 10) : '';
    if (startDateStr && startDateStr < todayVnStr) {
      throw new BadRequestException('Ngày bắt đầu không thể ở trong quá khứ');
    }

    // A40: Kiểm tra lịch trùng (cùng customer_id, service_id, frequency, time_start)
    const existingPlans = await this.planModel
      .find({
        customer_id: new Types.ObjectId(customerId),
        service_id: new Types.ObjectId(dto.service_id),
        frequency: dto.frequency,
        time_start: dto.time_start,
        status: RecurringPlanStatus.ACTIVE,
      })
      .exec();

    for (const existing of existingPlans) {
      if (dto.frequency === 'weekly') {
        const existingWeekdays = new Set(existing.weekdays ?? []);
        const hasOverlap = (dto.weekdays ?? []).some(w => existingWeekdays.has(w));
        if (hasOverlap) {
          throw new ConflictException('Bạn đã có lịch định kỳ cho dịch vụ này vào cùng khung giờ');
        }
      } else if (dto.frequency === 'monthly') {
        const existingMonthDays = new Set(existing.month_days ?? []);
        const hasOverlap = (dto.month_days ?? []).some(d => existingMonthDays.has(d));
        if (hasOverlap) {
          throw new ConflictException('Bạn đã có lịch định kỳ cho dịch vụ này vào cùng khung giờ');
        }
      }
    }

    const startDate = new Date(dto.start_date);
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('start_date không hợp lệ');
    }
    // B52: Gói phải tôn trọng ngày kết thúc — end_date phải sau start_date,
    // nếu không sẽ không sinh được buổi nào mà khách không hiểu lý do.
    if (dto.end_date) {
      const endDate = new Date(dto.end_date);
      if (Number.isNaN(endDate.getTime())) {
        throw new BadRequestException('end_date không hợp lệ');
      }
      if (endDate <= startDate) {
        throw new BadRequestException(
          `Ngày kết thúc (${dto.end_date}) phải sau ngày bắt đầu (${dto.start_date})`,
        );
      }
    }

    const monthDaysList = dto.frequency === 'monthly' ? [...new Set(dto.month_days ?? [])] : [];
    const highDays = monthDaysList.filter(d => d >= 29).sort((a, b) => a - b);
    const scheduleWarning =
      highDays.length > 0
        ? `Lưu ý: Các tháng không có ngày ${highDays.join(', ')} (như tháng 2 hoặc các tháng 30 ngày) sẽ tự động bỏ qua lượt đó.`
        : undefined;

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
      month_days: monthDaysList,
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
      schedule_warning: scheduleWarning,
    });

    // B52: Sinh đơn lần đầu — lỗi sinh đơn không được làm mất gói vừa tạo:
    // gói vẫn lưu, ca sinh đơn theo giờ sẽ thử lại; lý do lỗi được log rõ.
    try {
      await this.generateJobsForPlan(plan);
    } catch (err) {
      this.logger.warn(
        `Plan ${String(plan._id)}: sinh đơn lần đầu thất bại (${err instanceof Error ? err.message : err}) — gói vẫn được tạo, ca sinh đơn theo giờ sẽ thử lại`,
      );
    }
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
      time_start: dto.time_start ?? plan.time_start,
    };
    this.validateSchedule(next);

    // H1: Snapshot lịch cũ TRƯỚC khi cập nhật plan để so sánh chính xác scheduleChanged
    const oldFrequency = plan.frequency;
    const oldWeekdays = [...(plan.weekdays || [])].sort();
    const oldMonthDays = [...(plan.month_days || [])].sort();
    const oldTimeStart = plan.time_start;

    const newWeekdays = dto.weekdays ? [...new Set(dto.weekdays)].sort() : oldWeekdays;
    const newMonthDays = dto.month_days ? [...new Set(dto.month_days)].sort() : oldMonthDays;
    const newFrequency = (dto.frequency as RecurringFrequency) ?? oldFrequency;
    const newTimeStart = dto.time_start ?? oldTimeStart;

    const scheduleChanged =
      newFrequency !== oldFrequency ||
      JSON.stringify(newWeekdays) !== JSON.stringify(oldWeekdays) ||
      JSON.stringify(newMonthDays) !== JSON.stringify(oldMonthDays) ||
      newTimeStart !== oldTimeStart;

    if (dto.title) plan.title = dto.title;
    if (dto.description) plan.description = dto.description;
    if (dto.frequency) plan.frequency = dto.frequency as RecurringFrequency;
    if (dto.weekdays) plan.weekdays = [...new Set(dto.weekdays)];
    if (dto.month_days) plan.month_days = [...new Set(dto.month_days)];
    if (dto.time_start) plan.time_start = dto.time_start;
    if (dto.time_end !== undefined) plan.time_end = dto.time_end;
    if (dto.end_date) {
      // B52: Ngày kết thúc sửa đổi cũng phải sau ngày bắt đầu của gói
      const newEnd = new Date(dto.end_date);
      if (Number.isNaN(newEnd.getTime())) {
        throw new BadRequestException('end_date không hợp lệ');
      }
      if (newEnd <= new Date(plan.start_date)) {
        throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu của gói');
      }
      plan.end_date = newEnd;
    }
    if (dto.preferred_helper_id !== undefined) {
      await this.validatePreferredHelper(customerId, dto.preferred_helper_id ?? undefined);
      plan.preferred_helper_id = dto.preferred_helper_id
        ? new Types.ObjectId(dto.preferred_helper_id)
        : undefined;
    }
    const effectiveFreq = plan.frequency;
    const effectiveMonthDays = plan.month_days ?? [];
    if (effectiveFreq === RecurringFrequency.MONTHLY) {
      const highDays = effectiveMonthDays.filter(d => d >= 29).sort((a, b) => a - b);
      plan.schedule_warning =
        highDays.length > 0
          ? `Lưu ý: Các tháng không có ngày ${highDays.join(', ')} (như tháng 2 hoặc các tháng 30 ngày) sẽ tự động bỏ qua lượt đó.`
          : undefined;
    } else {
      plan.schedule_warning = undefined;
    }
    await plan.save();

    if (scheduleChanged) {
      const todayKey = this.dateKey(new Date());
      const oldJobs = await this.jobModel
        .find({
          recurring_plan_id: plan._id,
          occurrence_date: { $gte: todayKey },
          status: { $in: [JobStatus.OPEN, JobStatus.RECEIVING_QUOTES] },
        })
        .exec();
      for (const oj of oldJobs) {
        await this.jobsService
          .cancelJob(customerId, 'customer', String(oj._id), {
            reason: 'Thay đổi lịch gói định kỳ',
          })
          .catch(() => undefined);
      }
    }

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
    // B117: báo cho khách — chỉ gửi khi trạng thái thật sự đổi (guard trên đã
    // chặn mọi trường hợp không đổi), gửi đúng 1 lần sau khi lưu thành công.
    await this.notificationsService
      .create({
        userId: customerId,
        type: NOTIFICATION_TYPES.RECURRING_PLAN_PAUSED,
        title: 'Gói định kỳ đã tạm dừng',
        body: `Gói định kỳ "${plan.title}" đã được tạm dừng. Bạn có thể tiếp tục lại bất cứ lúc nào.`,
        payload: { plan_id: planId },
      })
      .catch(() => undefined);
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
    // B117: báo cho khách — chỉ khi trạng thái thật sự đổi, đúng 1 lần.
    await this.notificationsService
      .create({
        userId: customerId,
        type: NOTIFICATION_TYPES.RECURRING_PLAN_RESUMED,
        title: 'Gói định kỳ đã tiếp tục',
        body: `Gói định kỳ "${plan.title}" đã hoạt động trở lại. Các buổi tiếp theo sẽ được tạo như lịch.`,
        payload: { plan_id: planId },
      })
      .catch(() => undefined);
    return plan;
  }

  async skipNext(customerId: string, planId: string): Promise<RecurringPlanDocument> {
    const plan = await this.getOwnedPlan(customerId, planId);
    if (plan.status === RecurringPlanStatus.CANCELLED) {
      throw new BadRequestException('Gói đã hủy');
    }

    const today = this.startOfDay(new Date());
    // B53: Chỉ bỏ qua lần trong TƯƠNG LAI gần nhất — so theo cả ngày + giờ
    // bắt đầu (giống nextOccurrenceDate). Lượt hôm nay mà giờ làm đã qua thì
    // không còn là "lần tới" nữa, phải bỏ qua lượt kế tiếp.
    const now = new Date();
    const [hh, mm] = (plan.time_start || '09:00').split(':').map(Number);
    const upcoming = this.occurrenceDates(plan, today, this.addDays(today, 370))
      .filter(key => !plan.skipped_dates.includes(key))
      .filter(key => {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0, 0, 0).getTime() > now.getTime();
      });
    if (upcoming.length === 0) {
      throw new BadRequestException('Không còn lượt nào trong tương lai để bỏ qua');
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
    // N7(e): Prune skipped_dates để chống phình mảng vô hạn (giữ tối đa 60 ngày gần nhất)
    if (plan.skipped_dates.length > 60) {
      plan.skipped_dates = plan.skipped_dates.slice(-60);
    }
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

  async cancelPlan(
    customerId: string,
    planId: string,
    reason?: string,
  ): Promise<RecurringPlanDocument> {
    const plan = await this.getOwnedPlan(customerId, planId);
    if (plan.status === RecurringPlanStatus.CANCELLED) {
      throw new BadRequestException('Gói đã được hủy trước đó');
    }
    plan.status = RecurringPlanStatus.CANCELLED;
    await plan.save();

    const cancelReason = reason ? `Khách hủy gói định kỳ: ${reason}` : 'Khách hủy gói định kỳ';

    // P2-13: Hủy các job tương lai (kể cả CONFIRMED trong tương lai kèm thông báo cho thợ qua cancelJob)
    const todayKey = this.dateKey(new Date());
    const futureJobs = await this.jobModel
      .find({
        recurring_plan_id: plan._id,
        occurrence_date: { $gte: todayKey },
        status: { $in: [JobStatus.OPEN, JobStatus.RECEIVING_QUOTES, JobStatus.CONFIRMED] },
      })
      .exec();
    for (const job of futureJobs) {
      await this.jobsService
        .cancelJob(customerId, 'customer', String(job._id), { reason: cancelReason })
        .catch(() => undefined);
    }

    if (plan.preferred_helper_id) {
      await this.notificationsService
        .create({
          userId: String(plan.preferred_helper_id),
          type: NOTIFICATION_TYPES.RECURRING_PLAN_CANCELLED,
          title: 'Gói định kỳ đã bị hủy',
          body: `Khách hàng đã hủy gói định kỳ${reason ? `. Lý do: ${reason}` : '.'}`,
          payload: { plan_id: planId },
        })
        .catch(() => undefined);
    }

    // B117: báo cho khách — chỉ khi hủy thật sự (guard trên chặn hủy lần 2), đúng 1 lần.
    await this.notificationsService
      .create({
        userId: customerId,
        type: NOTIFICATION_TYPES.RECURRING_PLAN_CANCELLED,
        title: 'Gói định kỳ đã hủy',
        body: `Gói định kỳ "${plan.title}" đã được hủy${reason ? `. Lý do: ${reason}` : '.'} Các buổi chưa bắt đầu đã được hủy theo.`,
        payload: { plan_id: planId },
      })
      .catch(() => undefined);

    return plan;
  }
}

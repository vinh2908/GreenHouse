import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  SosBackupRequest,
  SosBackupRequestDocument,
  SosBackupStatus,
  SosBackupDecision,
} from './schemas/sos-backup.schema';
import { CreateSosBackupDto, CustomerDecisionDto } from './dto/sos-backup.dto';
import { hungarianMinimize } from './utils/hungarian';
import { Job, JobDocument, Contract, ContractDocument } from '../jobs/schemas/job.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  HelperPenaltyEvent,
  HelperPenaltyEventDocument,
} from '../helpers/schemas/helper-penalty-event.schema';
import {
  cancellationPenaltyPoints,
  countCancellationsInWindow,
  helperScoreConfigFromEnv,
} from '../helpers/utils/helper-score';
import {
  recordHelperCancellation,
  CancellationScoreSummary,
} from '../helpers/utils/record-cancellation';
import { AppGateway } from '../chat/app.gateway';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import {
  ContractStatus,
  HelperStatus,
  JobStatus,
  PaymentStatus,
  VerificationStatus,
} from '@homemate/types';
import { NOTIFICATION_TYPES, SOCKET_EVENTS } from '@homemate/constants';

/** Các trạng thái đơn mà thợ đang thực sự "giữ" đơn — được phép SOS và được phép thay người */
const ACTIVE_JOB_STATUSES: JobStatus[] = [
  JobStatus.CONFIRMED,
  JobStatus.HELPER_ON_THE_WAY,
  JobStatus.HELPER_ARRIVED,
  JobStatus.IN_PROGRESS,
];

interface CandidateInfo {
  helperId: string;
  cost: number;
  distanceKm: number;
  penaltyPoints: number;
  rating: number;
  completedJobs: number;
  activeJobs: number;
}

@Injectable()
export class SosBackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SosBackupService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  /** Mutex theo từng thợ khi accept — chống 1 thợ thắng 2 SOS cùng lúc */
  private acceptLocks = new Map<string, Promise<unknown>>();

  constructor(
    @InjectModel(SosBackupRequest.name)
    private readonly sosModel: Model<SosBackupRequestDocument>,
    @InjectModel(Job.name) private readonly jobModel: Model<JobDocument>,
    @InjectModel(Contract.name) private readonly contractModel: Model<ContractDocument>,
    @InjectModel(HelperProfile.name)
    private readonly helperModel: Model<HelperProfileDocument>,
    @InjectModel(HelperPenaltyEvent.name)
    private readonly penaltyEventModel: Model<HelperPenaltyEventDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly gateway: AppGateway,
    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Config (env, có mặc định an toàn) ──────────────────────────────────────
  // SOS_BACKUP_CUSTOMER_DECISION_TTL_SECONDS  — hạn khách quyết định (mặc định 300 = 5 phút)
  // SOS_BACKUP_DECISION_REMINDER_SECONDS      — mốc gửi 1 lần nhắc (mặc định 150 = giữa hạn)
  // SOS_BACKUP_ON_DECISION_TIMEOUT            — 'cancel_job' (mặc định) | 'accept_replacement'
  // SOS_BACKUP_BROADCAST_TTL_SECONDS          — tổng thời gian phát sóng tìm người thay (mặc định 240 = 4 phút)
  // SOS_BACKUP_WAVE_SIZE                      — số thợ mỗi đợt mời (mặc định 5)
  // SOS_BACKUP_WAVE_INTERVAL_SECONDS          — giãn cách leo thang đợt mời (mặc định 60)
  // SOS_BACKUP_MAX_DISTANCE_KM                — bán kính ứng viên tối đa (mặc định 30km)
  // SOS_BACKUP_LOCATION_MAX_AGE_MINUTES       — độ tươi tối đa của vị trí GPS (mặc định 120 phút)
  private cfgNum(key: string, def: number): number {
    const raw = this.configService.get<string>(key) ?? process.env[key];
    const n = raw == null ? Number.NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : def;
  }
  private get decisionTtlMs(): number {
    return this.cfgNum('SOS_BACKUP_CUSTOMER_DECISION_TTL_SECONDS', 300) * 1000;
  }
  private get decisionReminderMs(): number {
    return this.cfgNum('SOS_BACKUP_DECISION_REMINDER_SECONDS', 150) * 1000;
  }
  private get broadcastTtlMs(): number {
    return this.cfgNum('SOS_BACKUP_BROADCAST_TTL_SECONDS', 240) * 1000;
  }
  private get waveSize(): number {
    return Math.max(1, Math.floor(this.cfgNum('SOS_BACKUP_WAVE_SIZE', 5)));
  }
  private get waveIntervalMs(): number {
    return this.cfgNum('SOS_BACKUP_WAVE_INTERVAL_SECONDS', 60) * 1000;
  }
  private get maxDistanceKm(): number {
    return this.cfgNum('SOS_BACKUP_MAX_DISTANCE_KM', 30);
  }
  private get locationMaxAgeMs(): number {
    return this.cfgNum('SOS_BACKUP_LOCATION_MAX_AGE_MINUTES', 120) * 60_000;
  }
  /** Trọng số điểm phạt hủy đơn trong chi phí Hungarian (env SOS_BACKUP_COST_PENALTY_WEIGHT, mặc định 2) */
  private get penaltyCostWeight(): number {
    return this.cfgNum('SOS_BACKUP_COST_PENALTY_WEIGHT', 2);
  }
  private get onDecisionTimeout(): SosBackupDecision {
    const raw =
      this.configService.get<string>('SOS_BACKUP_ON_DECISION_TIMEOUT') ??
      process.env['SOS_BACKUP_ON_DECISION_TIMEOUT'];
    return raw === 'accept_replacement'
      ? SosBackupDecision.ACCEPT_REPLACEMENT
      : SosBackupDecision.CANCEL_JOB;
  }

  // ─── Vòng đời sweep: nhắc quyết định / quá hạn quyết định / leo thang đợt / hết hạn phát sóng ──
  onModuleInit() {
    const timer = setInterval(() => {
      void this.sweep().catch(err =>
        this.logger.error(`SOS sweep failed: ${(err as Error).message}`),
      );
    }, 15_000);
    (timer as unknown as { unref?: () => void }).unref?.();
    this.sweepTimer = timer;
    // Chạy ngay 1 vòng để khôi phục các yêu cầu tồn đọng sau khi server restart
    void this.sweep().catch(() => undefined);
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1) Thợ tạo SOS → CHỈ chuyển sang chờ khách quyết định, CHƯA phát sóng
  // ═══════════════════════════════════════════════════════════════════════════
  async createSos(helperId: string, jobId: string, dto: CreateSosBackupDto) {
    if (!Types.ObjectId.isValid(jobId)) throw new BadRequestException('job_id không hợp lệ');

    const job = await this.jobModel.findById(jobId).populate('service_id', 'name slug').exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) {
      throw new ForbiddenException('Chỉ thợ đang giữ đơn mới có thể gửi SOS cho đơn này');
    }
    if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
      throw new BadRequestException('Đơn không ở trạng thái đang thực hiện nên không thể SOS');
    }
    const acceptedMembers = (job.team ?? []).filter(
      m => m.status === 'accepted' && m.helper_id.toString() !== helperId,
    );
    if (acceptedMembers.length > 0) {
      throw new BadRequestException(
        'Đơn nhóm đang có thành viên khác — SOS thay người chưa hỗ trợ đơn nhóm',
      );
    }

    const existing = await this.sosModel
      .findOne({
        job_id: job._id,
        status: { $in: [SosBackupStatus.AWAITING_CUSTOMER, SosBackupStatus.PENDING] },
      })
      .exec();
    if (existing) {
      throw new ConflictException('Đơn này đang có một yêu cầu SOS chưa xử lý xong');
    }

    const contract = await this.contractModel
      .findOne({ job_id: job._id })
      .select('helper_receives')
      .lean()
      .exec();

    const service = job.service_id as unknown as { _id?: Types.ObjectId; name?: string };
    const serviceId = service?._id ?? (job.service_id as unknown as Types.ObjectId);
    const now = new Date();
    let sos: SosBackupRequestDocument;
    try {
      sos = await this.sosModel.create({
        job_id: job._id,
        customer_id: job.customer_id,
        original_helper_id: new Types.ObjectId(helperId),
        service_id: serviceId,
        reason: dto.reason,
        reason_note: dto.note,
        status: SosBackupStatus.AWAITING_CUSTOMER,
        decision_deadline: new Date(now.getTime() + this.decisionTtlMs),
        job_title: job.title,
        service_name: service?.name,
        district: job.address?.district,
        city: job.address?.city,
        helper_payout: contract?.helper_receives,
        candidates: [],
      });
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        throw new ConflictException('Đơn này đang có một yêu cầu SOS chưa xử lý xong');
      }
      throw err;
    }

    // Báo khách NGAY: popup qua socket + thông báo bền (notification).
    // Chưa hề phát sóng cho thợ dự phòng ở bước này — phải chờ khách đồng ý.
    const payload = this.decisionPayload(sos);
    this.gateway.emitToUser(
      String(job.customer_id),
      SOCKET_EVENTS.SOS_BACKUP_DECISION_REQUESTED,
      payload,
    );
    await this.notificationsService
      .create({
        userId: String(job.customer_id),
        type: NOTIFICATION_TYPES.SOS_BACKUP_DECISION_REQUEST,
        title: 'Người giúp việc có sự cố khẩn cấp',
        body: `Người giúp việc của đơn "${job.title}" gặp sự cố và không thể tiếp tục. Vui lòng chọn đổi người khác (giữ nguyên giá) hoặc hủy đơn (hoàn tiền 100%).`,
        payload: { job_id: jobId, sos_id: String(sos._id) },
      })
      .catch(() => undefined);

    // Điểm hiệu suất: 1 lần SOS = 1 lần thợ không thể hoàn thành đơn → tính vào
    // cửa sổ hủy 7 ngày như hủy đơn thường (bất kể khách chọn đổi người hay hủy
    // đơn sau đó). Đây là điểm UY TÍN, khác với "không bị phạt" của SOS (không
    // tính late-cancel/risk cho chính đơn này). Lỗi ghi điểm không chặn SOS.
    let cancellationScore: CancellationScoreSummary | null = null;
    try {
      cancellationScore = await recordHelperCancellation({
        helperModel: this.helperModel,
        penaltyEventModel: this.penaltyEventModel,
        helperId,
        source: 'sos_initiation',
        jobId,
        sosId: String(sos._id),
        envGet: key => this.configService.get<string>(key) ?? process.env[key],
      });
    } catch (err) {
      this.logger.warn(
        `recordHelperCancellation (SOS) failed for helper ${helperId}: ${(err as Error).message}`,
      );
    }

    return {
      ...this.serialize(sos),
      // Cho app hiển thị cảnh báo khi thợ gần/vượt ngưỡng hủy (approaching | penalized)
      cancellation_score: cancellationScore,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2) Khách quyết định: đổi người (mới bắt đầu ghép Hungarian + phát sóng) / hủy đơn
  // ═══════════════════════════════════════════════════════════════════════════
  async customerDecision(customerId: string, sosId: string, dto: CustomerDecisionDto) {
    if (!Types.ObjectId.isValid(sosId)) throw new BadRequestException('sos_id không hợp lệ');
    const sos = await this.sosModel.findById(sosId).exec();
    if (!sos) throw new NotFoundException('Yêu cầu SOS không tồn tại');
    if (sos.customer_id.toString() !== customerId) throw new ForbiddenException();

    const now = new Date();
    // Claim nguyên tử bước quyết định: chỉ 1 request thắng, tránh khách bấm 2 lần / 2 thiết bị
    const claimed = await this.sosModel
      .findOneAndUpdate(
        { _id: sos._id, status: SosBackupStatus.AWAITING_CUSTOMER },
        {
          $set: {
            customer_decision: dto.decision,
            decided_by: 'customer',
            decided_at: now,
            status:
              dto.decision === SosBackupDecision.ACCEPT_REPLACEMENT
                ? SosBackupStatus.PENDING
                : SosBackupStatus.CUSTOMER_CANCELLED,
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) {
      throw new ConflictException('Yêu cầu SOS này đã được xử lý hoặc đã hết hạn chờ quyết định');
    }

    if (dto.decision === SosBackupDecision.ACCEPT_REPLACEMENT) {
      await this.beginBroadcast(claimed);
    } else {
      await this.cancelJobWithSosPolicy(claimed, 'customer');
    }
    return this.serialize(claimed);
  }

  /** Xử lý khi khách quá hạn không quyết định — mặc định cấu hình: hủy đơn + hoàn tiền */
  private async handleDecisionTimeout(sos: SosBackupRequestDocument) {
    const decision = this.onDecisionTimeout;
    const now = new Date();
    const claimed = await this.sosModel
      .findOneAndUpdate(
        { _id: sos._id, status: SosBackupStatus.AWAITING_CUSTOMER },
        {
          $set: {
            customer_decision: decision,
            decided_by: 'timeout_default',
            decided_at: now,
            status:
              decision === SosBackupDecision.ACCEPT_REPLACEMENT
                ? SosBackupStatus.PENDING
                : SosBackupStatus.DECISION_TIMEOUT,
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) return; // đã có luồng khác xử lý

    this.logger.warn(
      `SOS ${String(sos._id)}: khách không quyết định trong hạn → áp dụng mặc định "${decision}"`,
    );
    if (decision === SosBackupDecision.ACCEPT_REPLACEMENT) {
      await this.beginBroadcast(claimed);
    } else {
      await this.cancelJobWithSosPolicy(claimed, 'timeout');
    }
  }

  /**
   * Hủy đơn theo chính sách SOS: khách được hoàn 100% số tiền THỰC TRẢ (nếu đã
   * trả online), thợ gốc được giải phóng và KHÔNG bị tính phạt (không đụng vào
   * late_cancellation_count / risk_score / cancellation_rate), hợp đồng hủy.
   * Lưu ý: trạng thái HELPER_ARRIVED / IN_PROGRESS không có cạnh → CANCELLED
   * trong state machine thường; chính sách SOS cho phép ép hủy vì thợ không
   * thể tiếp tục và khách đã đồng ý (hoặc quá hạn theo cấu hình mặc định).
   */
  private async cancelJobWithSosPolicy(
    sos: SosBackupRequestDocument,
    by: 'customer' | 'timeout',
  ): Promise<void> {
    const jobId = String(sos.job_id);
    const job = await this.jobModel.findById(sos.job_id).exec();
    if (!job) return;

    let refundAmount = 0;
    const contract = await this.contractModel.findOne({ job_id: job._id }).exec();
    if (
      job.payment_status === PaymentStatus.PAID &&
      job.payment_method !== 'cash' &&
      contract &&
      contract.total_price > 0
    ) {
      // Hoàn đúng số khách thực trả = giá chốt − giảm voucher − giảm điểm (phần giảm do sàn chịu)
      refundAmount = Math.max(
        0,
        contract.total_price - (job.discount_amount || 0) - (job.loyalty_discount_amount || 0),
      );
      if (refundAmount > 0) {
        try {
          await this.paymentsService.refundCustomer(
            String(job.customer_id),
            jobId,
            refundAmount,
            by === 'customer'
              ? 'Hủy đơn do thợ gặp sự cố (SOS) — khách chọn hủy'
              : 'Hủy đơn do thợ gặp sự cố (SOS) — khách không phản hồi trong hạn',
          );
          job.payment_status = PaymentStatus.REFUNDED;
        } catch (err) {
          // Hoàn tiền lỗi KHÔNG được chặn việc hủy (thợ không thể tiếp tục) —
          // gắn cờ admin đối soát ví thủ công.
          this.logger.error(
            `SOS refund failed for job ${jobId}: ${(err as Error).message} — flagging admin`,
          );
          await this.sosModel
            .updateOne(
              { _id: sos._id },
              {
                $set: {
                  admin_attention: true,
                  admin_note: `Hoàn tiền tự động thất bại (${refundAmount.toLocaleString('vi-VN')}₫) — cần đối soát ví thủ công`,
                },
              },
            )
            .exec();
        }
      }
    }

    if (contract && contract.status !== ContractStatus.CANCELLED) {
      contract.status = ContractStatus.CANCELLED;
      await contract.save();
    }

    const previousStatus = job.status;
    job.status = JobStatus.CANCELLED;
    job.cancellation_reason =
      by === 'customer'
        ? 'sos_backup: khách chọn hủy đơn sau khi thợ báo sự cố'
        : 'sos_backup: khách không phản hồi trong hạn — hủy theo chính sách mặc định';
    job.cancelled_by = job.customer_id;
    job.live_helper_location = undefined;
    job.events.push({
      status: JobStatus.CANCELLED,
      note:
        by === 'customer'
          ? `SOS Backup: khách đồng ý hủy đơn (trạng thái trước: ${previousStatus}), hoàn tiền ${refundAmount.toLocaleString('vi-VN')}₫, thợ không bị phạt`
          : `SOS Backup: quá hạn chờ khách quyết định → hủy đơn theo mặc định, hoàn tiền ${refundAmount.toLocaleString('vi-VN')}₫, thợ không bị phạt`,
      actor_id: job.customer_id,
      actor_role: by === 'customer' ? 'customer' : 'system',
      timestamp: new Date(),
    });
    await job.save();

    // Giải phóng thợ gốc (BUSY → ONLINE), tuyệt đối không tính phạt
    await this.setHelperBusy(String(sos.original_helper_id), false);
    await this.sosModel
      .updateOne(
        { _id: sos._id },
        {
          $set: {
            refund_amount: refundAmount,
            resolved_at: new Date(),
            original_helper_released: true,
          },
        },
      )
      .exec();

    const decidedPayload = {
      sos_id: String(sos._id),
      job_id: jobId,
      decision: SosBackupDecision.CANCEL_JOB,
      decided_by: by === 'customer' ? 'customer' : 'timeout_default',
      refund_amount: refundAmount,
    };
    this.gateway.emitToUser(
      String(sos.original_helper_id),
      SOCKET_EVENTS.SOS_BACKUP_DECIDED,
      decidedPayload,
    );
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.SOS_BACKUP_DECIDED, decidedPayload);
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.JOB_CANCELLED, {
      job_id: jobId,
      cancelled_by: 'sos_backup',
      reason: job.cancellation_reason,
    });

    await this.notificationsService
      .create({
        userId: String(sos.original_helper_id),
        type: NOTIFICATION_TYPES.SOS_BACKUP_JOB_CANCELLED,
        title: 'Đơn đã hủy — bạn được giải phóng',
        body:
          by === 'customer'
            ? `Khách hàng đã chọn hủy đơn "${sos.job_title}" sau yêu cầu SOS của bạn. Bạn không bị tính phạt cho lần hủy này.`
            : `Đơn "${sos.job_title}" đã tự động hủy do khách không phản hồi yêu cầu SOS trong thời hạn. Bạn không bị tính phạt cho lần hủy này.`,
        payload: { job_id: jobId, sos_id: String(sos._id) },
      })
      .catch(() => undefined);

    await this.notificationsService
      .create({
        userId: String(job.customer_id),
        type: NOTIFICATION_TYPES.SOS_BACKUP_JOB_CANCELLED,
        title: 'Đơn đã hủy & hoàn tiền theo chính sách SOS',
        body:
          refundAmount > 0
            ? `Đơn "${sos.job_title}" đã hủy. ${refundAmount.toLocaleString('vi-VN')}₫ đã được hoàn vào ví của bạn.`
            : `Đơn "${sos.job_title}" đã hủy theo chính sách SOS.`,
        payload: { job_id: jobId, sos_id: String(sos._id) },
      })
      .catch(() => undefined);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3) Phát sóng tìm người thay (chỉ chạy SAU khi khách đã đồng ý đổi người)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Bắt đầu giai đoạn phát sóng: tính ứng viên, chạy Hungarian toàn cục, mời đợt 1 */
  private async beginBroadcast(sos: SosBackupRequestDocument): Promise<void> {
    const now = new Date();
    await this.sosModel
      .updateOne(
        { _id: sos._id },
        {
          $set: {
            expires_at: new Date(now.getTime() + this.broadcastTtlMs),
            wave_started_at: now,
          },
        },
      )
      .exec();
    sos.expires_at = new Date(now.getTime() + this.broadcastTtlMs);
    sos.wave_started_at = now;

    // Báo thợ gốc: khách đã đồng ý đổi người → đang tìm người thay
    const decidedPayload = {
      sos_id: String(sos._id),
      job_id: String(sos.job_id),
      decision: SosBackupDecision.ACCEPT_REPLACEMENT,
      decided_by: sos.decided_by ?? 'customer',
    };
    this.gateway.emitToUser(
      String(sos.original_helper_id),
      SOCKET_EVENTS.SOS_BACKUP_DECIDED,
      decidedPayload,
    );
    this.gateway.emitToJob(String(sos.job_id), SOCKET_EVENTS.SOS_BACKUP_DECIDED, decidedPayload);

    await this.inviteWave(sos, 1);
  }

  /**
   * Chạy Hungarian trên TẤT CẢ SOS đang phát sóng (gồm cả sos hiện tại):
   * hàng = đơn SOS, cột = hợp nhất ứng viên, ô = chi phí (Infinity nếu thợ
   * không đủ điều kiện cho đơn đó). Trả về ghép tối ưu toàn cục cho từng SOS.
   */
  private async runGlobalMatching(
    focusSos: SosBackupRequestDocument,
  ): Promise<Map<string, { pool: CandidateInfo[]; optimalHelperId?: string }>> {
    const pendings = await this.sosModel
      .find({
        status: SosBackupStatus.PENDING,
        _id: { $ne: focusSos._id },
      })
      .exec();
    const all = [focusSos, ...pendings];

    const jobs = await this.jobModel.find({ _id: { $in: all.map(s => s.job_id) } }).exec();
    const jobById = new Map(jobs.map(j => [String(j._id), j]));

    const pools = new Map<string, CandidateInfo[]>();
    const helperIds = new Set<string>();
    for (const s of all) {
      const job = jobById.get(String(s.job_id));
      if (!job) {
        pools.set(String(s._id), []);
        continue;
      }
      const pool = await this.computeCandidatePool(job, s);
      pools.set(String(s._id), pool);
      pool.forEach(c => helperIds.add(c.helperId));
    }

    const helpers = [...helperIds];
    const result = new Map<string, { pool: CandidateInfo[]; optimalHelperId?: string }>();
    if (helpers.length === 0) {
      for (const s of all) result.set(String(s._id), { pool: pools.get(String(s._id)) ?? [] });
      return result;
    }

    const matrix: number[][] = all.map(s => {
      const pool = pools.get(String(s._id)) ?? [];
      const byHelper = new Map(pool.map(c => [c.helperId, c.cost]));
      return helpers.map(h => byHelper.get(h) ?? Number.POSITIVE_INFINITY);
    });
    const { pairs } = hungarianMinimize(matrix);
    const optimalBySos = new Map<string, string>();
    for (const pair of pairs) {
      optimalBySos.set(String(all[pair.row]._id), helpers[pair.col]);
    }
    for (const s of all) {
      result.set(String(s._id), {
        pool: pools.get(String(s._id)) ?? [],
        optimalHelperId: optimalBySos.get(String(s._id)),
      });
    }
    return result;
  }

  /**
   * Mời 1 đợt thợ cho 1 SOS: thợ tối ưu (Hungarian) của chính SOS này được ưu
   * tiên đầu tiên; các suất còn lại lấy theo chi phí tăng dần, LOẠI những thợ
   * đang là ghép tối ưu của SOS khác (họ nhận popup của SOS kia trước).
   */
  private async inviteWave(sos: SosBackupRequestDocument, wave: number): Promise<void> {
    const matching = await this.runGlobalMatching(sos);
    const mine = matching.get(String(sos._id));
    if (!mine) return;
    const optimalOfOthers = new Set(
      [...matching.entries()]
        .filter(([sosId]) => sosId !== String(sos._id))
        .map(([, v]) => v.optimalHelperId)
        .filter((v): v is string => !!v),
    );

    const alreadyInvited = new Set(
      sos.candidates.filter(c => c.wave > 0).map(c => String(c.helper_id)),
    );
    const declined = new Set(
      sos.candidates.filter(c => c.state === 'declined').map(c => String(c.helper_id)),
    );

    const ranked = [...mine.pool].sort((a, b) => a.cost - b.cost);
    const invitees: CandidateInfo[] = [];
    const optimal = ranked.find(c => c.helperId === mine.optimalHelperId);
    if (optimal && !alreadyInvited.has(optimal.helperId) && !declined.has(optimal.helperId)) {
      invitees.push(optimal);
    }
    for (const c of ranked) {
      if (invitees.length >= this.waveSize) break;
      if (invitees.some(x => x.helperId === c.helperId)) continue;
      if (alreadyInvited.has(c.helperId) || declined.has(c.helperId)) continue;
      if (optimalOfOthers.has(c.helperId)) continue; // ưu tiên cho SOS mà họ là ghép tối ưu
      invitees.push(c);
    }

    const now = new Date();
    // Ghi lại toàn bộ pool (chi phí + trạng thái) — ứng viên đã mời ở đợt trước giữ nguyên wave/state
    const previousByHelper = new Map(sos.candidates.map(c => [String(c.helper_id), c]));
    const merged = ranked.map(c => {
      const prev = previousByHelper.get(c.helperId);
      const invitedNow = invitees.some(x => x.helperId === c.helperId);
      return {
        helper_id: new Types.ObjectId(c.helperId),
        cost: c.cost,
        distance_km: c.distanceKm,
        penalty_points: c.penaltyPoints,
        rating: c.rating,
        completed_jobs: c.completedJobs,
        active_jobs: c.activeJobs,
        is_optimal_pick: mine.optimalHelperId === c.helperId,
        wave: invitedNow ? wave : (prev?.wave ?? 0),
        state: invitedNow
          ? ('invited' as const)
          : prev && prev.wave > 0
            ? prev.state
            : ('ranked' as const),
        invited_at: invitedNow ? now : prev?.invited_at,
        responded_at: prev?.responded_at,
      };
    });

    await this.sosModel
      .updateOne(
        { _id: sos._id, status: SosBackupStatus.PENDING },
        {
          $set: {
            candidates: merged,
            optimal_helper_id: mine.optimalHelperId
              ? new Types.ObjectId(mine.optimalHelperId)
              : undefined,
            current_wave: wave,
            wave_started_at: now,
          },
        },
      )
      .exec();
    sos.candidates = merged as SosBackupRequestDocument['candidates'];
    sos.current_wave = wave;
    sos.wave_started_at = now;

    for (const c of invitees) {
      this.gateway.emitToUser(c.helperId, SOCKET_EVENTS.SOS_BACKUP_REQUEST, {
        ...this.popupPayload(sos),
        distance_km: c.distanceKm,
      });
    }
    if (invitees.length > 0) {
      this.logger.log(
        `SOS ${String(sos._id)} wave ${wave}: invited ${invitees.length} helpers (optimal: ${mine.optimalHelperId ?? 'none'})`,
      );
    }
  }

  /**
   * Pool ứng viên cho 1 đơn SOS:
   *  - Hồ sơ thợ: ONLINE + đã duyệt e-KYC + có service của đơn trong service_ids
   *  - Đang kết nối socket (đang hoạt động trong app)
   *  - Có vị trí: GPS còn tươi (mặc định ≤ 120 phút) hoặc vị trí ghim tay (manual)
   *  - Trong bán kính tối đa và KHÔNG đang giữ đơn active nào
   * Chi phí (càng thấp càng tốt):
   *   cost = distance_km × 10 + (5 − rating) × 20 + max(0, 50 − completed_jobs) × 0.6
   *        + active_jobs × 100 + penalty_points × 2
   *   (penalty_points = điểm phạt hủy đơn hiện tại theo helper-score.ts — thợ bị
   *   trừ điểm tin cậy sẽ kém cạnh tranh hơn; hệ số 2 chỉnh bằng env
   *   SOS_BACKUP_COST_PENALTY_WEIGHT)
   * Khác chuyên môn = loại khỏi pool (= Infinity trong ma trận toàn cục).
   */
  private async computeCandidatePool(
    job: JobDocument,
    sos: SosBackupRequestDocument,
  ): Promise<CandidateInfo[]> {
    const jobCoords = job.address?.location?.coordinates; // [lng, lat]
    if (!jobCoords) return [];

    const profiles = await this.helperModel
      .find({
        status: HelperStatus.ONLINE,
        verification_status: VerificationStatus.APPROVED,
        user_id: { $ne: sos.original_helper_id },
        service_ids: job.service_id,
      })
      .exec();
    if (profiles.length === 0) return [];

    const userIds = profiles.map(p => String(p.user_id));
    const activeJobs = await this.jobModel
      .find({
        helper_id: { $in: userIds.map(id => new Types.ObjectId(id)) },
        status: { $in: ACTIVE_JOB_STATUSES },
      })
      .select('helper_id')
      .lean()
      .exec();
    const activeCountByHelper = new Map<string, number>();
    for (const j of activeJobs) {
      const key = String(j.helper_id);
      activeCountByHelper.set(key, (activeCountByHelper.get(key) ?? 0) + 1);
    }

    const nowMs = Date.now();
    const pool: CandidateInfo[] = [];
    for (const profile of profiles) {
      const helperId = String(profile.user_id);
      if (helperId === String(job.customer_id)) continue;
      if (!this.gateway.isUserOnline(helperId)) continue; // phải đang mở app

      const coords = profile.location?.coordinates;
      if (!coords) continue;
      if (profile.location_source === 'gps' || profile.last_location_update) {
        const age = profile.last_location_update
          ? nowMs - new Date(profile.last_location_update).getTime()
          : Number.POSITIVE_INFINITY;
        if (age > this.locationMaxAgeMs) continue; // vị trí GPS quá cũ
      }

      const distanceKm = this.haversineKm(coords[1], coords[0], jobCoords[1], jobCoords[0]);
      if (distanceKm > this.maxDistanceKm) continue;

      const activeJobsCount = activeCountByHelper.get(helperId) ?? 0;
      if (activeJobsCount > 0) continue; // đang bận đơn khác

      const rating = profile.rating ?? 0;
      const completedJobs = profile.completed_jobs ?? 0;
      // Điểm phạt hủy đơn hiện tại (tính tươi từ các mốc hủy trong cửa sổ) —
      // thợ đang bị trừ điểm tin cậy sẽ kém cạnh tranh hơn khi ghép Hungarian.
      const scoreConfig = helperScoreConfigFromEnv(
        key => this.configService.get<string>(key) ?? process.env[key],
      );
      const penaltyPoints = cancellationPenaltyPoints(
        countCancellationsInWindow(
          profile.cancellation_timestamps ?? [],
          new Date(nowMs),
          scoreConfig.windowDays,
        ),
        scoreConfig,
      );
      const cost =
        Math.round(
          (distanceKm * 10 +
            (5 - rating) * 20 +
            Math.max(0, 50 - completedJobs) * 0.6 +
            activeJobsCount * 100 +
            penaltyPoints * this.penaltyCostWeight) *
            100,
        ) / 100;

      pool.push({
        helperId,
        cost,
        distanceKm: Math.round(distanceKm * 10) / 10,
        penaltyPoints,
        rating,
        completedJobs,
        activeJobs: activeJobsCount,
      });
    }
    return pool.sort((a, b) => a.cost - b.cost);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4) Ứng viên accept (claim nguyên tử — first-accept-wins) / decline
  // ═══════════════════════════════════════════════════════════════════════════
  async acceptSos(helperId: string, sosId: string) {
    // Mutex theo thợ: 1 thợ không thể thắng 2 SOS trong cùng khoảnh khắc
    const previous = this.acceptLocks.get(helperId) ?? Promise.resolve();
    const run = previous.then(() => this.acceptSosLocked(helperId, sosId));
    this.acceptLocks.set(
      helperId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private async acceptSosLocked(helperId: string, sosId: string) {
    if (!Types.ObjectId.isValid(sosId)) throw new BadRequestException('sos_id không hợp lệ');
    const sos = await this.sosModel.findById(sosId).exec();
    if (!sos) throw new NotFoundException('Yêu cầu SOS không tồn tại');
    if (sos.status === SosBackupStatus.AWAITING_CUSTOMER) {
      throw new BadRequestException('Khách hàng chưa đồng ý đổi người — chưa thể nhận thay');
    }
    if (sos.status !== SosBackupStatus.PENDING) {
      throw new ConflictException('Yêu cầu SOS này đã kết thúc');
    }
    if (sos.expires_at && sos.expires_at.getTime() <= Date.now()) {
      await this.expireSos(sos, 'ttl');
      throw new ConflictException('Yêu cầu SOS đã hết hạn');
    }

    const candidate = sos.candidates.find(c => String(c.helper_id) === helperId);
    if (!candidate || candidate.state !== 'invited') {
      throw new ForbiddenException('Bạn không nằm trong đợt mời hiện tại của yêu cầu này');
    }

    // Thợ vừa nhận 1 đơn active khác trong lúc chờ → không đủ điều kiện nữa
    const busyElsewhere = await this.jobModel
      .exists({
        helper_id: new Types.ObjectId(helperId),
        status: { $in: ACTIVE_JOB_STATUSES },
        _id: { $ne: sos.job_id },
      })
      .exec();
    if (busyElsewhere) {
      throw new ConflictException('Bạn đang có đơn khác đang thực hiện');
    }

    const now = new Date();
    // CLAIM NGUYÊN TỬ: chỉ request đầu tiên chuyển pending → accepted thắng
    const claimed = await this.sosModel
      .findOneAndUpdate(
        { _id: sos._id, status: SosBackupStatus.PENDING },
        {
          $set: {
            status: SosBackupStatus.ACCEPTED,
            replacement_helper_id: new Types.ObjectId(helperId),
            resolved_at: now,
            original_helper_released: true,
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) throw new ConflictException('Đã có người khác nhận thay rồi');

    await this.sosModel
      .updateOne(
        { _id: sos._id },
        {
          $set: {
            'candidates.$[winner].state': 'accepted',
            'candidates.$[winner].responded_at': now,
          },
        },
        { arrayFilters: [{ 'winner.helper_id': new Types.ObjectId(helperId) }] },
      )
      .exec();

    // Đổi thợ trên đơn — NGUYÊN TỬ theo helper cũ + trạng thái active.
    // Chỉ đổi helper_id: giá, hợp đồng tiền, payment_status KHÔNG hề đụng tới
    // (tiền khách giữ đảm bảo đứng yên; thợ mới nhận đúng helper_receives cũ
    // khi đơn hoàn thành như thợ thường).
    const jobBefore = await this.jobModel.findById(sos.job_id).select('status title').lean().exec();
    const swapped = await this.jobModel
      .findOneAndUpdate(
        {
          _id: sos.job_id,
          helper_id: sos.original_helper_id,
          status: { $in: ACTIVE_JOB_STATUSES },
        },
        {
          $set: {
            helper_id: new Types.ObjectId(helperId),
            sos_backup_replacement: {
              sos_request_id: sos._id,
              previous_helper_id: sos.original_helper_id,
              new_helper_id: new Types.ObjectId(helperId),
              reason: sos.reason,
              replaced_at: now,
            },
          },
          $unset: { live_helper_location: '' },
          $inc: { sos_backup_count: 1 },
          $push: {
            events: {
              status: jobBefore?.status ?? JobStatus.CONFIRMED,
              note: `SOS Backup: thay người giúp việc do sự cố (${sos.reason}) — khách đã đồng ý đổi người`,
              actor_id: new Types.ObjectId(helperId),
              actor_role: 'helper',
              timestamp: now,
            },
          },
        },
        { new: true },
      )
      .exec();

    if (!swapped) {
      // Đơn đã đổi trạng thái ngoài dự kiến (vd vừa bị hủy) → trả claim lại
      await this.sosModel
        .updateOne(
          { _id: sos._id, status: SosBackupStatus.ACCEPTED },
          {
            $set: { status: SosBackupStatus.PENDING, replacement_helper_id: undefined },
            $unset: { resolved_at: '' },
          },
        )
        .exec();
      throw new ConflictException('Đơn đã thay đổi trạng thái — không thể thay người lúc này');
    }

    // Hợp đồng: chỉ đổi người thực hiện, giữ nguyên mọi con số tiền
    await this.contractModel
      .updateOne(
        { job_id: sos.job_id, status: ContractStatus.ACTIVE },
        { $set: { helper_id: new Types.ObjectId(helperId) } },
      )
      .exec();

    // Thêm thợ mới vào cuộc trò chuyện của đơn để nhắn với khách ngay
    await this.chatService.addParticipantByJob(String(sos.job_id), helperId).catch(err => {
      this.logger.warn(`addParticipantByJob failed for SOS ${sosId}: ${(err as Error).message}`);
    });

    // Trạng thái bận/rảnh: thợ cũ được giải phóng (nếu không còn đơn active nào),
    // thợ mới thành BUSY nếu đơn đang ở giai đoạn di chuyển/làm việc
    const originalStillBusy = await this.jobModel
      .exists({
        helper_id: sos.original_helper_id,
        status: { $in: ACTIVE_JOB_STATUSES },
        _id: { $ne: sos.job_id },
      })
      .exec();
    if (!originalStillBusy) await this.setHelperBusy(String(sos.original_helper_id), false);
    if (
      [JobStatus.HELPER_ON_THE_WAY, JobStatus.HELPER_ARRIVED, JobStatus.IN_PROGRESS].includes(
        swapped.status,
      )
    ) {
      await this.setHelperBusy(helperId, true);
    }

    // Đóng các ứng viên còn lại
    await this.sosModel
      .updateOne(
        { _id: sos._id },
        { $set: { 'candidates.$[rest].state': 'resolved' } },
        {
          arrayFilters: [
            { 'rest.state': 'invited', 'rest.helper_id': { $ne: new Types.ObjectId(helperId) } },
          ],
        },
      )
      .exec();

    const replacedPayload = {
      sos_id: String(sos._id),
      job_id: String(sos.job_id),
      previous_helper_id: String(sos.original_helper_id),
      new_helper_id: helperId,
      replaced_at: now.toISOString(),
    };
    this.gateway.emitToJob(
      String(sos.job_id),
      SOCKET_EVENTS.SOS_BACKUP_HELPER_REPLACED,
      replacedPayload,
    );
    this.gateway.emitToUser(
      String(sos.customer_id),
      SOCKET_EVENTS.SOS_BACKUP_HELPER_REPLACED,
      replacedPayload,
    );
    this.gateway.emitToUser(String(sos.customer_id), SOCKET_EVENTS.JOB_STATUS_CHANGED, {
      job_id: String(sos.job_id),
      status: swapped.status,
    });
    for (const c of sos.candidates) {
      const cid = String(c.helper_id);
      if (c.state === 'invited' && cid !== helperId) {
        this.gateway.emitToUser(cid, SOCKET_EVENTS.SOS_BACKUP_RESOLVED, {
          sos_id: String(sos._id),
          job_id: String(sos.job_id),
          outcome: 'taken',
        });
      }
    }

    await this.notificationsService
      .create({
        userId: String(sos.customer_id),
        type: NOTIFICATION_TYPES.SOS_BACKUP_HELPER_REPLACED,
        title: 'Đã có người giúp việc thay thế',
        body: `Một người giúp việc khác sẽ tiếp tục đơn "${sos.job_title}" của bạn. Giá và số tiền đang giữ đảm bảo không thay đổi.`,
        payload: { job_id: String(sos.job_id), sos_id: String(sos._id) },
      })
      .catch(() => undefined);
    await this.notificationsService
      .create({
        userId: String(sos.original_helper_id),
        type: NOTIFICATION_TYPES.SOS_BACKUP_HELPER_REPLACED,
        title: 'Đã có người thay thế bạn',
        body: `Đơn "${sos.job_title}" đã được bàn giao cho thợ khác. Bạn được giải phóng và không bị tính phạt.`,
        payload: { job_id: String(sos.job_id), sos_id: String(sos._id) },
      })
      .catch(() => undefined);

    return { sos: this.serialize(claimed), job: swapped };
  }

  async declineSos(helperId: string, sosId: string) {
    if (!Types.ObjectId.isValid(sosId)) throw new BadRequestException('sos_id không hợp lệ');
    const sos = await this.sosModel.findById(sosId).exec();
    if (!sos) throw new NotFoundException('Yêu cầu SOS không tồn tại');
    if (sos.status !== SosBackupStatus.PENDING) return { success: true };

    const candidate = sos.candidates.find(c => String(c.helper_id) === helperId);
    if (!candidate || candidate.state !== 'invited') return { success: true };

    const now = new Date();
    await this.sosModel
      .updateOne(
        { _id: sos._id },
        {
          $set: {
            'candidates.$[c].state': 'declined',
            'candidates.$[c].responded_at': now,
          },
        },
        { arrayFilters: [{ 'c.helper_id': new Types.ObjectId(helperId) }] },
      )
      .exec();
    candidate.state = 'declined';

    // Mọi người được mời đều từ chối → leo thang đợt tiếp ngay (hoặc hết hạn nếu cạn ứng viên)
    const anyoneLeftInvited = sos.candidates.some(c => c.state === 'invited');
    if (!anyoneLeftInvited) {
      const fresh = await this.sosModel.findById(sos._id).exec();
      if (fresh && fresh.status === SosBackupStatus.PENDING) {
        await this.escalateOrExpire(fresh);
      }
    }
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5) Thợ gốc thu hồi SOS (khi chưa có người thay)
  // ═══════════════════════════════════════════════════════════════════════════
  async cancelSos(helperId: string, sosId: string) {
    if (!Types.ObjectId.isValid(sosId)) throw new BadRequestException('sos_id không hợp lệ');
    const sos = await this.sosModel.findById(sosId).exec();
    if (!sos) throw new NotFoundException('Yêu cầu SOS không tồn tại');
    if (sos.original_helper_id.toString() !== helperId) throw new ForbiddenException();

    const wasBroadcasting = sos.status === SosBackupStatus.PENDING;
    const wasAwaiting = sos.status === SosBackupStatus.AWAITING_CUSTOMER;
    if (!wasBroadcasting && !wasAwaiting) {
      throw new ConflictException('Yêu cầu SOS này đã kết thúc — không thể thu hồi');
    }

    const claimed = await this.sosModel
      .findOneAndUpdate(
        { _id: sos._id, status: sos.status },
        { $set: { status: SosBackupStatus.CANCELLED, resolved_at: new Date() } },
        { new: true },
      )
      .exec();
    if (!claimed) throw new ConflictException('Yêu cầu SOS này đã kết thúc — không thể thu hồi');

    if (wasBroadcasting) {
      for (const c of sos.candidates) {
        if (c.state === 'invited') {
          this.gateway.emitToUser(String(c.helper_id), SOCKET_EVENTS.SOS_BACKUP_RESOLVED, {
            sos_id: String(sos._id),
            job_id: String(sos.job_id),
            outcome: 'withdrawn',
          });
        }
      }
    }
    if (wasAwaiting) {
      const payload = {
        sos_id: String(sos._id),
        job_id: String(sos.job_id),
        decision: 'sos_withdrawn',
      };
      this.gateway.emitToUser(String(sos.customer_id), SOCKET_EVENTS.SOS_BACKUP_DECIDED, payload);
      await this.notificationsService
        .create({
          userId: String(sos.customer_id),
          type: NOTIFICATION_TYPES.SYSTEM,
          title: 'Người giúp việc đã thu hồi yêu cầu SOS',
          body: `Đơn "${sos.job_title}" vẫn tiếp tục với người giúp việc hiện tại như bình thường.`,
          payload: { job_id: String(sos.job_id), sos_id: String(sos._id) },
        })
        .catch(() => undefined);
    }
    return this.serialize(claimed);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6) Truy vấn cho app (bắt kịp trạng thái khi reconnect / mở lại màn hình)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Cho thợ: popup SOS mình đang được mời (incoming) + SOS mình đã gửi (outgoing) */
  async getActiveForHelper(helperId: string) {
    const helperOid = new Types.ObjectId(helperId);
    const [incomingSos, outgoingSos] = await Promise.all([
      this.sosModel
        .find({
          status: SosBackupStatus.PENDING,
          candidates: {
            $elemMatch: { helper_id: helperOid, state: 'invited' },
          },
        })
        .sort({ created_at: -1 })
        .exec(),
      this.sosModel
        .find({
          original_helper_id: helperOid,
          status: { $in: [SosBackupStatus.AWAITING_CUSTOMER, SosBackupStatus.PENDING] },
        })
        .sort({ created_at: -1 })
        .exec(),
    ]);

    return {
      incoming: incomingSos.map(sos => {
        const candidate = sos.candidates.find(c => String(c.helper_id) === helperId);
        return { ...this.popupPayload(sos), distance_km: candidate?.distance_km ?? null };
      }),
      outgoing: outgoingSos.map(sos => this.serialize(sos)),
    };
  }

  /** Cho khách: các SOS đang chờ mình quyết định (hiện popup khi khách mở lại app) */
  async getCustomerPending(customerId: string) {
    const list = await this.sosModel
      .find({
        customer_id: new Types.ObjectId(customerId),
        status: SosBackupStatus.AWAITING_CUSTOMER,
      })
      .sort({ created_at: -1 })
      .exec();
    return { items: list.map(sos => this.decisionPayload(sos)) };
  }

  /** Trạng thái SOS đang hoạt động của 1 đơn (cho màn hình chi tiết đơn 2 phía) */
  async getByJob(userId: string, jobId: string) {
    if (!Types.ObjectId.isValid(jobId)) return { sos: null };
    const sos = await this.sosModel
      .findOne({
        job_id: new Types.ObjectId(jobId),
        status: { $in: [SosBackupStatus.AWAITING_CUSTOMER, SosBackupStatus.PENDING] },
        $or: [
          { original_helper_id: new Types.ObjectId(userId) },
          { customer_id: new Types.ObjectId(userId) },
          { 'candidates.helper_id': new Types.ObjectId(userId) },
        ],
      })
      .exec();
    if (!sos) return { sos: null };
    return {
      sos: this.serialize(sos, {
        my_state:
          sos.original_helper_id.toString() === userId
            ? 'originator'
            : sos.customer_id.toString() === userId
              ? 'customer'
              : 'candidate',
        my_candidate_state: sos.candidates.find(c => String(c.helper_id) === userId)?.state,
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7) Leo thang / hết hạn / sweep định kỳ
  // ═══════════════════════════════════════════════════════════════════════════

  /** Đợt hiện tại đã "cháy" hết → mời đợt tiếp theo; cạn ứng viên thì hết hạn luôn */
  private async escalateOrExpire(sos: SosBackupRequestDocument): Promise<void> {
    if (sos.expires_at && sos.expires_at.getTime() <= Date.now()) {
      await this.expireSos(sos, 'ttl');
      return;
    }
    const invitedCount = sos.candidates.filter(c => c.wave > 0).length;
    await this.inviteWave(sos, sos.current_wave + 1);
    const fresh = await this.sosModel.findById(sos._id).exec();
    if (!fresh || fresh.status !== SosBackupStatus.PENDING) return;
    const invitedAfter = fresh.candidates.filter(c => c.wave > 0).length;
    const anyoneInvited = fresh.candidates.some(c => c.state === 'invited');
    if (invitedAfter <= invitedCount && !anyoneInvited) {
      // Không còn ứng viên mới nào để mời và không ai đang giữ lời mời → kết thúc sớm
      await this.expireSos(fresh, 'no_candidates');
    }
  }

  /** Hết hạn phát sóng: khách + thợ gốc được báo, gắn cờ admin xử lý thủ công */
  private async expireSos(
    sos: SosBackupRequestDocument,
    reason: 'ttl' | 'no_candidates',
  ): Promise<void> {
    const claimed = await this.sosModel
      .findOneAndUpdate(
        { _id: sos._id, status: SosBackupStatus.PENDING },
        {
          $set: {
            status: SosBackupStatus.EXPIRED,
            resolved_at: new Date(),
            admin_attention: true,
            admin_note:
              reason === 'ttl'
                ? 'SOS backup hết hạn phát sóng — chưa có thợ thay thế, cần admin hỗ trợ thủ công'
                : 'SOS backup cạn ứng viên phù hợp — cần admin hỗ trợ thủ công',
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) return;

    for (const c of sos.candidates) {
      if (c.state === 'invited') {
        this.gateway.emitToUser(String(c.helper_id), SOCKET_EVENTS.SOS_BACKUP_RESOLVED, {
          sos_id: String(sos._id),
          job_id: String(sos.job_id),
          outcome: 'expired',
        });
      }
    }

    const payload = {
      sos_id: String(sos._id),
      job_id: String(sos.job_id),
      reason,
    };
    this.gateway.emitToUser(String(sos.customer_id), SOCKET_EVENTS.SOS_BACKUP_EXPIRED, payload);
    this.gateway.emitToUser(
      String(sos.original_helper_id),
      SOCKET_EVENTS.SOS_BACKUP_EXPIRED,
      payload,
    );

    await this.notificationsService
      .create({
        userId: String(sos.customer_id),
        type: NOTIFICATION_TYPES.SOS_BACKUP_EXPIRED,
        title: 'Chưa tìm được người thay thế',
        body: `Hiện chưa có người giúp việc khác nhận thay đơn "${sos.job_title}". Đội ngũ hỗ trợ sẽ liên hệ để xử lý tiếp.`,
        payload: { job_id: String(sos.job_id), sos_id: String(sos._id) },
      })
      .catch(() => undefined);
    await this.notificationsService
      .create({
        userId: String(sos.original_helper_id),
        type: NOTIFICATION_TYPES.SOS_BACKUP_EXPIRED,
        title: 'Chưa tìm được người thay thế',
        body: `Yêu cầu SOS cho đơn "${sos.job_title}" đã hết hạn. Đội ngũ hỗ trợ sẽ liên hệ để xử lý tiếp.`,
        payload: { job_id: String(sos.job_id), sos_id: String(sos._id) },
      })
      .catch(() => undefined);

    // Admin: thông báo cho mọi tài khoản admin
    const admins = await this.userModel
      .find({ role: 'admin', is_active: true })
      .select('_id')
      .lean()
      .exec();
    for (const admin of admins) {
      await this.notificationsService
        .create({
          userId: String(admin._id),
          type: NOTIFICATION_TYPES.SOS_BACKUP_EXPIRED,
          title: 'SOS backup hết hạn — cần xử lý thủ công',
          body: `Đơn "${sos.job_title}" (SOS của thợ ${String(sos.original_helper_id)}) không tìm được người thay. Khách: ${String(sos.customer_id)}.`,
          payload: { job_id: String(sos.job_id), sos_id: String(sos._id) },
        })
        .catch(() => undefined);
    }
  }

  /** Vòng quét 15s: nhắc khách quyết định → quá hạn quyết định → leo thang đợt → hết hạn phát sóng */
  private async sweep(): Promise<void> {
    const now = new Date();

    // (a) Nhắc khách 1 lần ở mốc giữa hạn
    const toRemind = await this.sosModel
      .find({
        status: SosBackupStatus.AWAITING_CUSTOMER,
        decision_reminder_sent: false,
        decision_deadline: { $gt: now },
      })
      .exec();
    for (const sos of toRemind) {
      if (now.getTime() - sos.created_at.getTime() < this.decisionReminderMs) continue;
      const marked = await this.sosModel
        .updateOne(
          {
            _id: sos._id,
            status: SosBackupStatus.AWAITING_CUSTOMER,
            decision_reminder_sent: false,
          },
          { $set: { decision_reminder_sent: true } },
        )
        .exec();
      if (marked.modifiedCount === 0) continue;
      this.gateway.emitToUser(
        String(sos.customer_id),
        SOCKET_EVENTS.SOS_BACKUP_DECISION_REQUESTED,
        { ...this.decisionPayload(sos), reminder: true },
      );
      await this.notificationsService
        .create({
          userId: String(sos.customer_id),
          type: NOTIFICATION_TYPES.SOS_BACKUP_DECISION_REMINDER,
          title: 'Nhắc: cần bạn quyết định cho đơn đang chờ',
          body: `Người giúp việc của đơn "${sos.job_title}" đang chờ bạn chọn đổi người hoặc hủy đơn. Nếu quá hạn, hệ thống sẽ tự hủy đơn và hoàn tiền 100%.`,
          payload: { job_id: String(sos.job_id), sos_id: String(sos._id) },
        })
        .catch(() => undefined);
    }

    // (b) Quá hạn chờ khách quyết định → áp dụng hành vi mặc định (env)
    const timedOut = await this.sosModel
      .find({
        status: SosBackupStatus.AWAITING_CUSTOMER,
        decision_deadline: { $lte: now },
      })
      .exec();
    for (const sos of timedOut) {
      await this.handleDecisionTimeout(sos).catch(err =>
        this.logger.error(
          `Decision timeout failed for SOS ${String(sos._id)}: ${(err as Error).message}`,
        ),
      );
    }

    // (c) + (d) Các SOS đang phát sóng: leo thang đợt / hết hạn
    const broadcasting = await this.sosModel.find({ status: SosBackupStatus.PENDING }).exec();
    for (const sos of broadcasting) {
      try {
        if (sos.expires_at && sos.expires_at.getTime() <= now.getTime()) {
          await this.expireSos(sos, 'ttl');
          continue;
        }
        const waveAge = sos.wave_started_at
          ? now.getTime() - sos.wave_started_at.getTime()
          : Number.POSITIVE_INFINITY;
        const anyoneInvited = sos.candidates.some(c => c.state === 'invited');
        if (waveAge >= this.waveIntervalMs && anyoneInvited) {
          await this.inviteWave(sos, sos.current_wave + 1);
        } else if (!anyoneInvited) {
          await this.escalateOrExpire(sos);
        }
      } catch (err) {
        this.logger.error(
          `Broadcast sweep failed for SOS ${String(sos._id)}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** Payload popup quyết định cho KHÁCH (chỉ mã lý do, không chi tiết riêng tư của thợ) */
  private decisionPayload(sos: SosBackupRequestDocument) {
    return {
      sos_id: String(sos._id),
      job_id: String(sos.job_id),
      job_title: sos.job_title,
      service_name: sos.service_name,
      reason: sos.reason,
      district: sos.district,
      city: sos.city,
      status: sos.status,
      decision_deadline: sos.decision_deadline?.toISOString(),
      decision_expires_at_ms: sos.decision_deadline?.getTime(),
    };
  }

  /** Payload popup "có người cần backup" cho ỨNG VIÊN */
  private popupPayload(sos: SosBackupRequestDocument) {
    return {
      sos_id: String(sos._id),
      job_id: String(sos.job_id),
      job_title: sos.job_title,
      service_name: sos.service_name,
      district: sos.district,
      city: sos.city,
      payout: sos.helper_payout ?? null,
      wave: sos.current_wave,
      expires_at: sos.expires_at?.toISOString(),
      expires_at_ms: sos.expires_at?.getTime(),
    };
  }

  private serialize(
    sos: SosBackupRequestDocument,
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    const obj = sos.toObject() as unknown as Record<string, unknown>;
    return {
      ...obj,
      _id: String(sos._id),
      sos_id: String(sos._id),
      job_id: String(sos.job_id),
      customer_id: String(sos.customer_id),
      original_helper_id: String(sos.original_helper_id),
      ...(extra ?? {}),
    };
  }

  /** Đồng bộ trạng thái bận/rảnh của thợ (cùng quy ước như JobsService.setHelperBusy) */
  private async setHelperBusy(helperId: string, busy: boolean): Promise<void> {
    const target = busy ? HelperStatus.BUSY : HelperStatus.ONLINE;
    const guard = busy ? HelperStatus.ONLINE : HelperStatus.BUSY;
    await this.helperModel
      .updateOne({ user_id: new Types.ObjectId(helperId), status: guard }, { status: target })
      .exec()
      .catch(() => undefined);
  }

  /** Khoảng cách đường chim bay (km) — cùng công thức như MatchingService */
  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

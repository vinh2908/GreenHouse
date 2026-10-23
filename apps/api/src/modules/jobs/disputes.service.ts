import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument, Contract, ContractDocument } from './schemas/job.schema';
import {
  DisputeCase,
  DisputeCaseDocument,
  DisputeTimelineKind,
} from './schemas/dispute-case.schema';
import { AddDisputeEntryDto, AppealDisputeDto } from './dto/dispute.dto';
import { JobStatus, ContractStatus } from '@homemate/types';
import {
  DISPUTE_APPEAL_WINDOW_HOURS,
  NOTIFICATION_TYPES,
  SOCKET_EVENTS,
} from '@homemate/constants';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Hồ sơ tranh chấp (DisputeCase) — lớp mở rộng trên dispute sẵn có của Job:
 * timeline sự kiện cho khách / thợ / admin, bổ sung bằng chứng sau khi mở,
 * xem phán quyết và kháng cáo đúng 1 lần trong thời hạn cấu hình
 * (env DISPUTE_APPEAL_WINDOW_HOURS, mặc định 72 giờ).
 */
@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @InjectModel(DisputeCase.name) private caseModel: Model<DisputeCaseDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    private readonly gateway: AppGateway,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  private async findCase(jobObjectId: Types.ObjectId): Promise<DisputeCaseDocument | null> {
    const found = await this.caseModel.findOne({ job_id: jobObjectId }).exec();
    return found as unknown as DisputeCaseDocument | null;
  }

  private appealWindowHours(): number {
    const fromEnv = Number(this.configService.get<string>('DISPUTE_APPEAL_WINDOW_HOURS'));
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DISPUTE_APPEAL_WINDOW_HOURS;
  }

  private emitUpdate(caseDoc: DisputeCaseDocument) {
    const payload = {
      job_id: String(caseDoc.job_id),
      case_id: String(caseDoc._id),
      status: caseDoc.status,
      updated_at: new Date().toISOString(),
    };
    this.gateway.emitToJob(String(caseDoc.job_id), SOCKET_EVENTS.DISPUTE_UPDATED, payload);
    this.gateway.emitToUser(String(caseDoc.customer_id), SOCKET_EVENTS.DISPUTE_UPDATED, payload);
    if (caseDoc.helper_id) {
      this.gateway.emitToUser(String(caseDoc.helper_id), SOCKET_EVENTS.DISPUTE_UPDATED, payload);
    }
  }

  private assertParticipant(
    caseDoc: DisputeCaseDocument,
    userId: string,
    isAdmin: boolean,
  ): 'customer' | 'helper' | 'admin' {
    if (isAdmin) return 'admin';
    if (String(caseDoc.customer_id) === userId) return 'customer';
    if (caseDoc.helper_id && String(caseDoc.helper_id) === userId) return 'helper';
    throw new ForbiddenException('Bạn không có quyền truy cập hồ sơ tranh chấp này');
  }

  // ─── Tạo hồ sơ từ job vừa mở dispute (gọi bởi JobsService.openDispute) ────

  async createCaseFromJob(
    job: JobDocument,
    actorId: string,
    actorRole: 'customer' | 'helper',
  ): Promise<DisputeCaseDocument> {
    const existing = await this.findCase(job._id);
    if (existing) return existing;

    return this.caseModel.create({
      job_id: job._id,
      customer_id: job.customer_id,
      helper_id: job.helper_id,
      opened_by: new Types.ObjectId(actorId),
      opened_by_role: actorRole,
      status: 'open',
      reason: job.dispute_reason ?? '',
      timeline: [
        {
          kind: 'opened',
          actor_id: new Types.ObjectId(actorId),
          actor_role: actorRole,
          text: job.dispute_reason ?? '',
          photos: job.dispute_photos ?? [],
          created_at: new Date(),
        },
      ],
    });
  }

  /** Job đã dispute từ trước khi có DisputeCase → tự khởi tạo hồ sơ từ dữ liệu cũ */
  private async syncCaseFromJob(job: JobDocument): Promise<DisputeCaseDocument | null> {
    if (!job.dispute_reason && job.status !== JobStatus.DISPUTED && !job.dispute_resolution) {
      return null;
    }
    const openedBy = job.dispute_opened_by ?? job.customer_id;
    const openedRole = String(openedBy) === String(job.customer_id) ? 'customer' : 'helper';
    const caseDoc = (await this.caseModel.create({
      job_id: job._id,
      customer_id: job.customer_id,
      helper_id: job.helper_id,
      opened_by: openedBy,
      opened_by_role: openedRole,
      status: job.dispute_resolution ? 'resolved' : 'open',
      reason: job.dispute_reason ?? '',
      timeline: [
        {
          kind: 'opened',
          actor_id: openedBy,
          actor_role: openedRole,
          text: job.dispute_reason ?? '',
          photos: job.dispute_photos ?? [],
          created_at: job.dispute_opened_at ?? job.created_at,
        },
      ],
      resolution: job.dispute_resolution,
      resolved_at: job.dispute_resolution?.resolved_at,
      appeal_deadline: job.dispute_resolution?.resolved_at
        ? new Date(
            new Date(job.dispute_resolution.resolved_at).getTime() +
              this.appealWindowHours() * 3600 * 1000,
          )
        : undefined,
    })) as unknown as DisputeCaseDocument;
    if (job.dispute_resolution) {
      caseDoc.timeline.push({
        kind: 'resolution',
        actor_id: job.dispute_resolution.resolved_by ?? openedBy,
        actor_role: 'admin',
        text: job.dispute_resolution.admin_note ?? '',
        photos: [],
        created_at: job.dispute_resolution.resolved_at ?? new Date(),
      });
      await caseDoc.save();
    }
    return caseDoc;
  }

  // ─── Đọc hồ sơ ─────────────────────────────────────────────────────────────

  async getCaseForJob(jobId: string, userId: string, isAdmin: boolean) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    let caseDoc = await this.findCase(job._id);
    if (!caseDoc) {
      caseDoc = await this.syncCaseFromJob(job);
    }
    if (!caseDoc) {
      throw new NotFoundException('Đơn này chưa có hồ sơ tranh chấp');
    }

    const role = this.assertParticipant(caseDoc, userId, isAdmin);
    return {
      ...caseDoc.toObject(),
      can_appeal:
        role !== 'admin' &&
        caseDoc.status === 'resolved' &&
        !caseDoc.appeal &&
        !!caseDoc.appeal_deadline &&
        new Date(caseDoc.appeal_deadline).getTime() > Date.now(),
      appeal_window_hours: this.appealWindowHours(),
    };
  }

  // ─── Bổ sung bằng chứng / ghi chú ─────────────────────────────────────────

  async addEntry(
    jobId: string,
    userId: string,
    isAdmin: boolean,
    actorRole: string,
    dto: AddDisputeEntryDto,
  ): Promise<DisputeCaseDocument> {
    const text = dto.text?.trim();
    const photos = dto.photos ?? [];
    if (!text && photos.length === 0) {
      throw new BadRequestException('Vui lòng nhập nội dung hoặc đính kèm ảnh bằng chứng');
    }

    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    let caseDoc = await this.findCase(job._id);
    if (!caseDoc) caseDoc = await this.syncCaseFromJob(job);
    if (!caseDoc) throw new NotFoundException('Đơn này chưa có hồ sơ tranh chấp');

    const role = isAdmin ? 'admin' : this.assertParticipant(caseDoc, userId, false);
    if (caseDoc.status === 'resolved') {
      throw new BadRequestException(
        'Hồ sơ đã có phán quyết. Nếu không đồng ý, hãy dùng chức năng Kháng cáo.',
      );
    }

    const kind: DisputeTimelineKind =
      role === 'admin' ? 'admin_message' : photos.length > 0 ? 'evidence' : 'note';
    caseDoc.timeline.push({
      kind,
      actor_id: new Types.ObjectId(userId),
      actor_role: role === 'admin' ? 'admin' : role,
      text,
      photos,
      created_at: new Date(),
    });
    await caseDoc.save();

    // Đồng bộ ảnh bằng chứng về job để màn hình admin cũ vẫn xem được
    if (photos.length > 0 && role !== 'admin') {
      await this.jobModel
        .findByIdAndUpdate(job._id, { $push: { dispute_photos: { $each: photos } } })
        .exec();
    }

    this.emitUpdate(caseDoc);
    const targets = [
      String(caseDoc.customer_id),
      caseDoc.helper_id ? String(caseDoc.helper_id) : null,
    ].filter((t): t is string => !!t && t !== userId);
    for (const target of targets) {
      await this.notificationsService
        .create({
          userId: target,
          type: NOTIFICATION_TYPES.SYSTEM,
          title: '⚖️ Hồ sơ tranh chấp có cập nhật',
          body: `Đơn "${job.title}": ${role === 'admin' ? 'Admin vừa phản hồi' : 'Đối phương vừa bổ sung thông tin'} trong hồ sơ tranh chấp.`,
          payload: { job_id: jobId },
        })
        .catch(() => undefined);
    }
    return caseDoc;
  }

  // ─── Kháng cáo (đúng 1 lần, trong thời hạn sau phán quyết) ────────────────

  async appeal(
    jobId: string,
    userId: string,
    actorRole: string,
    dto: AppealDisputeDto,
  ): Promise<DisputeCaseDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    let caseDoc = await this.findCase(job._id);
    if (!caseDoc) caseDoc = await this.syncCaseFromJob(job);
    if (!caseDoc) throw new NotFoundException('Đơn này chưa có hồ sơ tranh chấp');

    const role = this.assertParticipant(caseDoc, userId, false);
    if (caseDoc.status !== 'resolved') {
      throw new BadRequestException('Chỉ có thể kháng cáo sau khi Admin đã ra phán quyết');
    }
    if (caseDoc.appeal) {
      throw new BadRequestException(
        'Hồ sơ này đã được kháng cáo 1 lần — phán quyết sau kháng cáo là cuối cùng',
      );
    }
    if (!caseDoc.appeal_deadline || new Date(caseDoc.appeal_deadline).getTime() < Date.now()) {
      throw new BadRequestException(
        `Đã hết thời hạn kháng cáo (${this.appealWindowHours()} giờ kể từ phán quyết)`,
      );
    }

    caseDoc.status = 'appealed';
    caseDoc.appeal = {
      by: new Types.ObjectId(userId),
      by_role: role,
      reason: dto.reason.trim(),
      created_at: new Date(),
    };
    caseDoc.timeline.push({
      kind: 'appeal',
      actor_id: new Types.ObjectId(userId),
      actor_role: role,
      text: dto.reason.trim(),
      photos: [],
      created_at: new Date(),
    });
    await caseDoc.save();

    // Đưa job trở lại trạng thái tranh chấp để Admin phân xử lại bằng luồng sẵn có
    job.status = JobStatus.DISPUTED;
    job.events.push({
      status: JobStatus.DISPUTED,
      note: `Kháng cáo phán quyết: ${dto.reason.trim()}`,
      actor_id: new Types.ObjectId(userId),
      actor_role: role,
      timestamp: new Date(),
    });
    await job.save();
    await this.contractModel
      .findOneAndUpdate({ job_id: job._id }, { status: ContractStatus.DISPUTED })
      .exec();

    this.emitUpdate(caseDoc);
    const otherParty = role === 'customer' ? caseDoc.helper_id : caseDoc.customer_id;
    if (otherParty) {
      await this.notificationsService
        .create({
          userId: String(otherParty),
          type: NOTIFICATION_TYPES.SYSTEM,
          title: '⚖️ Phán quyết tranh chấp bị kháng cáo',
          body: `Đơn "${job.title}" đang được Admin xem xét lại sau kháng cáo.`,
          payload: { job_id: jobId },
        })
        .catch(() => undefined);
    }
    return caseDoc;
  }

  // ─── Ghi nhận phán quyết (gọi bởi JobsService.resolveDispute) ─────────────

  async recordResolution(job: JobDocument, adminId: string): Promise<void> {
    try {
      let caseDoc = await this.findCase(job._id);
      if (!caseDoc) {
        caseDoc = await this.syncCaseFromJob(job);
        if (!caseDoc) return;
      }
      const wasAppealed = caseDoc.status === 'appealed' || !!caseDoc.appeal;
      caseDoc.status = 'resolved';
      caseDoc.resolution = job.dispute_resolution;
      caseDoc.resolved_at = job.dispute_resolution?.resolved_at ?? new Date();
      caseDoc.appeal_deadline = caseDoc.appeal
        ? undefined
        : new Date(Date.now() + this.appealWindowHours() * 3600 * 1000);
      caseDoc.timeline.push({
        kind: wasAppealed ? 'appeal_resolved' : 'resolution',
        actor_id: new Types.ObjectId(adminId),
        actor_role: 'admin',
        text: job.dispute_resolution?.admin_note ?? '',
        photos: [],
        created_at: new Date(),
      });
      await caseDoc.save();
      this.emitUpdate(caseDoc);
    } catch (err) {
      // Không để lỗi ghi hồ sơ làm hỏng luồng phân xử chính
      this.logger.error(
        `recordResolution failed for job ${String(job._id)}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

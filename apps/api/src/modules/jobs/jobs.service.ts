import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Job,
  JobDocument,
  Quote,
  QuoteDocument,
  Contract,
  ContractDocument,
} from './schemas/job.schema';
import {
  CreateJobDto,
  CreateSosJobDto,
  CreateQuoteDto,
  SelectQuoteDto,
  CompleteJobDto,
  ReviewJobDto,
  CancelJobDto,
  UpdateJobDto,
  OpenDisputeDto,
  ResolveDisputeDto,
  ProposeAmendmentDto,
  RespondAmendmentDto,
} from './dto/job.dto';
import {
  JobStatus,
  PaymentStatus,
  QuoteStatus,
  ContractStatus,
  isValidJobTransition,
  HelperStatus,
  VerificationStatus,
} from '@homemate/types';
import {
  JOB_OPEN_EXPIRY_HOURS,
  JOB_QUOTE_EXPIRY_HOURS,
  PLATFORM_FEE_BY_SERVICE,
  SOCKET_EVENTS,
  NOTIFICATION_TYPES,
} from '@homemate/constants';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '../chat/chat.service';
import { PaymentsService } from '../payments/payments.service';
import { Service, ServiceDocument } from '../services/schemas/service.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { RoutingService } from './routing.service';

// Beyond this straight-line distance a helper is treated as out of the job's area.
const QUOTE_SERVICE_RADIUS_KM = 30;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(Quote.name) private quoteModel: Model<QuoteDocument>,
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    @InjectModel(Service.name) private serviceModel: Model<ServiceDocument>,
    @InjectModel(HelperProfile.name) private helperModel: Model<HelperProfileDocument>,
    private readonly gateway: AppGateway,
    private readonly notificationsService: NotificationsService,
    private readonly chatService: ChatService,
    private readonly paymentsService: PaymentsService,
    private readonly routingService: RoutingService,
  ) {}

  // ─── Helper: add event to job ────────────────────────────────────────────

  private addEvent(
    job: JobDocument,
    status: JobStatus,
    actorId: string,
    actorRole: string,
    note?: string,
  ) {
    job.events.push({
      status,
      note,
      actor_id: new Types.ObjectId(actorId),
      actor_role: actorRole,
      timestamp: new Date(),
    });
    job.status = status;
  }

  private async setHelperBusy(helperId: string | Types.ObjectId, busy: boolean) {
    await this.helperModel
      .updateOne(
        {
          user_id: new Types.ObjectId(String(helperId)),
          status: busy ? { $ne: HelperStatus.BUSY } : HelperStatus.BUSY,
        },
        { status: busy ? HelperStatus.BUSY : HelperStatus.ONLINE },
      )
      .exec();
  }

  async isVerifiedHelper(userId: string | Types.ObjectId): Promise<boolean> {
    const found = await this.helperModel
      .exists({
        user_id: new Types.ObjectId(String(userId)),
        verification_status: VerificationStatus.APPROVED,
      })
      .exec();
    return !!found;
  }

  async requireVerifiedHelper(userId: string): Promise<void> {
    if (!(await this.isVerifiedHelper(userId))) {
      throw new ForbiddenException(
        'Bạn cần hoàn tất xác thực danh tính (e-KYC) để xem và nhận việc.',
      );
    }
  }

  private validateTransition(from: JobStatus, to: JobStatus) {
    if (!isValidJobTransition(from, to)) {
      throw new BadRequestException(`Không thể chuyển trạng thái từ "${from}" sang "${to}"`);
    }
  }

  // ─── Check Helper Schedule Conflict (Chống trùng lịch hẹn) ────────────────

  private async checkHelperScheduleConflict(
    helperId: string | Types.ObjectId,
    preferredDate?: Date,
    preferredTimeStart?: string,
    excludeJobId?: string,
  ): Promise<void> {
    if (!preferredDate || !preferredTimeStart || preferredTimeStart.includes('Khẩn cấp')) {
      return;
    }

    const startOfDay = new Date(preferredDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(preferredDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query: Record<string, unknown> = {
      helper_id: new Types.ObjectId(String(helperId)),
      status: {
        $in: [
          JobStatus.CONFIRMED,
          JobStatus.HELPER_ON_THE_WAY,
          JobStatus.HELPER_ARRIVED,
          JobStatus.IN_PROGRESS,
        ],
      },
      preferred_date: { $gte: startOfDay, $lte: endOfDay },
      preferred_time_start: preferredTimeStart,
    };
    if (excludeJobId && Types.ObjectId.isValid(excludeJobId)) {
      query['_id'] = { $ne: new Types.ObjectId(excludeJobId) };
    }

    const conflictingJob = await this.jobModel
      .findOne(query)
      .select('title preferred_time_start')
      .exec();
    if (conflictingJob) {
      throw new ConflictException(
        `Thợ đã có công việc "${conflictingJob.title}" trùng vào khung giờ ${preferredTimeStart} ngày này.`,
      );
    }
  }

  // ─── Realtime: emit job status change to all participants ─────────────────

  private emitJobStatusChange(job: JobDocument) {
    const payload = {
      job_id: String(job._id),
      status: job.status,
      updated_at: new Date().toISOString(),
    };
    this.gateway.emitToJob(String(job._id), SOCKET_EVENTS.JOB_STATUS_CHANGED, payload);
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.JOB_STATUS_CHANGED, payload);
    if (job.helper_id) {
      this.gateway.emitToUser(String(job.helper_id), SOCKET_EVENTS.JOB_STATUS_CHANGED, payload);
    }
  }

  // ─── Customer: Create Job ─────────────────────────────────────────────────

  async createJob(customerId: string, dto: CreateJobDto): Promise<JobDocument> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + JOB_OPEN_EXPIRY_HOURS);

    const job = await this.jobModel.create({
      customer_id: new Types.ObjectId(customerId),
      service_id: new Types.ObjectId(dto.service_id),
      status: JobStatus.OPEN,
      title: dto.title,
      description: dto.description,
      photos: dto.photos ?? [],
      videos: dto.videos ?? [],
      address: {
        full_address: dto.address.full_address,
        ward: dto.address.ward,
        district: dto.address.district,
        city: dto.address.city,
        location: { type: 'Point', coordinates: dto.address.location.coordinates },
        notes: dto.address.notes,
      },
      preferred_date: dto.preferred_date ? new Date(dto.preferred_date) : undefined,
      preferred_time_start: dto.preferred_time_start,
      preferred_time_end: dto.preferred_time_end,
      is_flexible_time: dto.is_flexible_time ?? false,
      expires_at: expiresAt,
      events: [
        {
          status: JobStatus.OPEN,
          actor_id: new Types.ObjectId(customerId),
          actor_role: 'customer',
          timestamp: new Date(),
          note: 'Đăng yêu cầu',
        },
      ],
    });

    await this.notifyNearbyHelpers(job);

    this.gateway.emitToUser(customerId, SOCKET_EVENTS.JOB_CREATED, {
      job_id: String(job._id),
      status: job.status,
    });

    return job;
  }

  private async notifyNearbyHelpers(job: JobDocument): Promise<void> {
    const coordinates = job.address?.location?.coordinates;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      !coordinates.every(Number.isFinite)
    ) {
      return;
    }

    try {
      const helpers = await this.helperModel
        .aggregate<{ user_id: Types.ObjectId }>([
          {
            $geoNear: {
              near: { type: 'Point', coordinates },
              distanceField: 'distance_meters',
              maxDistance: QUOTE_SERVICE_RADIUS_KM * 1000,
              spherical: true,
              key: 'location',
              query: {
                status: HelperStatus.ONLINE,
                verification_status: VerificationStatus.APPROVED,
                service_ids: job.service_id,
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: 'user_id',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          { $match: { 'user.status': 'active', 'user.is_deleted': { $ne: true } } },
          { $project: { user_id: 1 } },
          { $limit: 100 },
        ])
        .exec();

      const district = job.address?.district ? ` tại ${job.address.district}` : '';
      const notifications = await Promise.allSettled(
        helpers.map(helper =>
          this.notificationsService.create({
            userId: String(helper.user_id),
            type: NOTIFICATION_TYPES.NEW_JOB_NEARBY,
            title: 'Có đơn mới gần bạn 🎉',
            body: `${job.title}${district}. Mở mục Công việc để xem chi tiết và gửi báo giá.`,
            payload: {
              job_id: String(job._id),
              service_id: String(job.service_id),
              is_sos: false,
            },
          }),
        ),
      );
      const failedCount = notifications.filter(result => result.status === 'rejected').length;
      if (failedCount > 0) {
        this.logger.warn(`Could not deliver ${failedCount} nearby-job notifications`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not find or notify helpers for job ${String(job._id)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ─── Customer: Create SOS Emergency Job ───────────────────────────────────

  async createSosJob(customerId: string, dto: CreateSosJobDto): Promise<JobDocument> {
    const serviceSlug = dto.category || 'electrician';
    let service = await this.serviceModel.findOne({ slug: serviceSlug }).exec();
    if (!service) {
      service = await this.serviceModel.findOne({}).exec();
    }
    if (!service) throw new BadRequestException('Hệ thống chưa có dịch vụ cứu hộ phù hợp');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2);

    const surcharge = dto.surcharge ?? 100000;

    const job = await this.jobModel.create({
      customer_id: new Types.ObjectId(customerId),
      service_id: service._id,
      status: JobStatus.OPEN,
      is_sos: true,
      sos_category: dto.category,
      sos_surcharge: surcharge,
      sos_eta_minutes: 15,
      title: `🚨 [SOS CỨU HỘ] ${dto.title}`,
      description: dto.description,
      photos: dto.photos ?? [],
      address: {
        full_address: dto.address.full_address,
        ward: dto.address.ward,
        district: dto.address.district,
        city: dto.address.city,
        location: { type: 'Point', coordinates: dto.address.location.coordinates },
        notes: dto.address.notes,
      },
      preferred_date: new Date(),
      preferred_time_start: 'Khẩn cấp (Có mặt sau 15p)',
      is_flexible_time: false,
      expires_at: expiresAt,
      events: [
        {
          status: JobStatus.OPEN,
          actor_id: new Types.ObjectId(customerId),
          actor_role: 'customer',
          timestamp: new Date(),
          note: '🚨 Yêu cầu cứu hộ khẩn cấp SOS',
        },
      ],
    });

    const verifiedHelpers: { user_id: Types.ObjectId }[] = await this.helperModel
      .aggregate([
        {
          $match: { status: HelperStatus.ONLINE, verification_status: VerificationStatus.APPROVED },
        },
        { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } },
        { $match: { 'user.status': { $ne: 'suspended' }, 'user.is_deleted': { $ne: true } } },
        { $project: { user_id: 1 } },
      ])
      .exec();

    const broadcastPayload = {
      job_id: String(job._id),
      is_sos: true,
      category: dto.category,
      title: job.title,
      description: job.description,
      district: dto.address.district,
      address: dto.address.full_address,
      surcharge: surcharge,
      eta_minutes: 15,
      created_at: job.created_at,
    };

    for (const helper of verifiedHelpers) {
      this.gateway.emitToUser(
        String(helper.user_id),
        SOCKET_EVENTS.SOS_BROADCAST,
        broadcastPayload,
      );
      this.notificationsService
        .create({
          userId: String(helper.user_id),
          type: NOTIFICATION_TYPES.NEW_JOB_NEARBY,
          title: '🚨 CỨU HỘ KHẨN CẤP SOS GẦN BẠN!',
          body: `${dto.title} tại ${dto.address.district}. Phụ phí SOS: +${surcharge.toLocaleString()}đ`,
          payload: { job_id: String(job._id), is_sos: true },
        })
        .catch(() => {});
    }

    this.gateway.emitToUser(customerId, SOCKET_EVENTS.JOB_CREATED, {
      job_id: String(job._id),
      is_sos: true,
      status: job.status,
    });

    return job;
  }

  // ─── Customer: Update job info & address (before completion) ──────────────

  async updateJob(customerId: string, jobId: string, dto: UpdateJobDto): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.customer_id.toString() !== customerId) throw new ForbiddenException();

    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.CANCELLED ||
      job.status === JobStatus.DISPUTED ||
      job.status === JobStatus.REFUNDED
    ) {
      throw new BadRequestException('Không thể cập nhật đơn hàng ở trạng thái này');
    }

    if (dto.title) job.title = dto.title;
    if (dto.description) job.description = dto.description;
    if (dto.photos) job.photos = dto.photos;
    if (dto.videos) job.videos = dto.videos;
    if (dto.preferred_date) job.preferred_date = new Date(dto.preferred_date);
    if (dto.preferred_time_start) job.preferred_time_start = dto.preferred_time_start;
    if (dto.preferred_time_end) job.preferred_time_end = dto.preferred_time_end;
    if (dto.is_flexible_time !== undefined) job.is_flexible_time = dto.is_flexible_time;

    if (dto.address) {
      const prevLocation = job.address?.location?.coordinates || [106.6297, 10.8231];
      job.address = {
        full_address: dto.address.full_address || job.address.full_address,
        ward: dto.address.ward ?? job.address.ward,
        district: dto.address.district || job.address.district,
        city: dto.address.city || job.address.city,
        notes: dto.address.notes ?? job.address.notes,
        location: {
          type: 'Point',
          coordinates: dto.address.location?.coordinates || prevLocation,
        },
      } as any;
    }

    this.addEvent(job, job.status, customerId, 'customer', 'Cập nhật thông tin/địa chỉ đơn hàng');
    await job.save();

    this.emitJobStatusChange(job);

    return job;
  }

  // ─── Helper: Accept SOS Job Immediately (First-Accept Matching) ────────────

  async acceptSosJob(
    helperId: string,
    jobId: string,
  ): Promise<{ job: JobDocument; contract: ContractDocument }> {
    const job = await this.jobModel.findById(jobId).populate('service_id').exec();
    if (!job) throw new NotFoundException('Đơn cứu hộ SOS không tồn tại');
    if (!job.is_sos) throw new BadRequestException('Đây không phải đơn cứu hộ SOS');
    if (job.status !== JobStatus.OPEN) {
      throw new ConflictException('Đơn cứu hộ này đã có thợ khác nhận');
    }

    if (job.customer_id.toString() === helperId) {
      throw new BadRequestException('Bạn không thể tự nhận đơn cứu hộ của chính mình');
    }

    const helperProfile = await this.helperModel
      .findOne({ user_id: new Types.ObjectId(helperId) })
      .exec();
    if (!helperProfile || helperProfile.verification_status !== VerificationStatus.APPROVED) {
      throw new ForbiddenException('Chỉ thợ đã xác thực e-KYC mới có quyền nhận đơn cứu hộ SOS');
    }

    const claimed = await this.jobModel
      .findOneAndUpdate(
        { _id: job._id, status: JobStatus.OPEN, helper_id: null },
        { $set: { helper_id: new Types.ObjectId(helperId) } },
        { new: true },
      )
      .exec();
    if (!claimed) throw new ConflictException('Đơn cứu hộ này đã có thợ khác nhận');

    const baseCost = 200000;
    const surcharge = job.sos_surcharge || 100000;
    const totalPrice = baseCost + surcharge;
    const platformFee = Math.round(totalPrice * PLATFORM_FEE_BY_SERVICE.default);
    const helperReceives = totalPrice - platformFee;

    const quote = await this.quoteModel.create({
      job_id: new Types.ObjectId(jobId),
      helper_id: new Types.ObjectId(helperId),
      labor_cost: baseCost,
      materials_cost: surcharge,
      total_price: totalPrice,
      platform_fee: platformFee,
      helper_receives: helperReceives,
      estimated_duration: 1,
      warranty_days: 30,
      notes: '🚨 Đơn cứu hộ khẩn cấp SOS - Thợ có mặt sau 15 phút',
      status: QuoteStatus.ACCEPTED,
      expires_at: new Date(Date.now() + 3600 * 1000 * 2),
    });

    const contract = await this.contractModel.create({
      job_id: new Types.ObjectId(jobId),
      quote_id: quote._id,
      customer_id: job.customer_id,
      helper_id: new Types.ObjectId(helperId),
      labor_cost: baseCost,
      materials_cost: surcharge,
      total_price: totalPrice,
      platform_fee: platformFee,
      helper_receives: helperReceives,
      warranty_days: 30,
      scheduled_at: new Date(),
      signed_by_customer_at: new Date(),
    });

    this.addEvent(job, JobStatus.CONFIRMED, helperId, 'helper', 'Thợ đã nhận cứu hộ SOS');
    job.helper_id = new Types.ObjectId(helperId);
    job.selected_quote_id = quote._id as any;
    await job.save();

    await this.helperModel
      .updateOne(
        { user_id: new Types.ObjectId(helperId) },
        { $inc: { total_quotes_sent: 1, accepted_quotes: 1 } },
      )
      .exec();

    await this.chatService.getOrCreateConversation(jobId, [String(job.customer_id), helperId]);

    const payload = {
      job_id: jobId,
      helper_id: helperId,
      contract_id: String(contract._id),
      status: JobStatus.CONFIRMED,
      eta_minutes: job.sos_eta_minutes || 15,
    };
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.SOS_ACCEPTED, payload);
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.SOS_ACCEPTED, payload);
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.JOB_STATUS_CHANGED, {
      job_id: jobId,
      status: JobStatus.CONFIRMED,
    });

    await this.notificationsService.create({
      userId: String(job.customer_id),
      type: NOTIFICATION_TYPES.JOB_CONFIRMED,
      title: '🚨 ĐÃ CÓ THỢ NHẬN CỨU HỘ SOS!',
      body: `Thợ đang chuẩn bị đồ nghề và di chuyển gấp đến bạn (Dự kiến 15 phút).`,
      payload: { job_id: jobId },
    });

    return { job, contract };
  }

  // ─── Customer: Get own jobs ───────────────────────────────────────────────

  async getCustomerJobs(customerId: string, status?: string) {
    const query: Record<string, unknown> = { customer_id: new Types.ObjectId(customerId) };
    if (status) {
      const statuses = status
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      query['status'] = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    return this.jobModel
      .find(query)
      .populate('service_id', 'name slug icon')
      .populate('helper_id', 'full_name phone avatar')
      .sort({ created_at: -1 })
      .exec();
  }

  // ─── Get single job ───────────────────────────────────────────────────────

  async getJobById(jobId: string): Promise<JobDocument> {
    const job = await this.jobModel
      .findById(jobId)
      .populate('service_id', 'name slug icon platform_fee_percent')
      .populate('customer_id', 'full_name phone avatar')
      .populate('helper_id', 'full_name phone avatar')
      .exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    return job;
  }

  async getJobForUser(jobId: string, userId: string, roles: string[]) {
    const job = await this.getJobById(jobId);
    const ownerId = String((job.customer_id as any)?._id ?? job.customer_id);
    const helperId = job.helper_id ? String((job.helper_id as any)?._id ?? job.helper_id) : null;
    const isOwnerOrHelper = ownerId === userId || helperId === userId;

    if (roles.includes('admin') || isOwnerOrHelper) {
      if (roles.includes('helper') || helperId === userId) {
        return this.enrichJobWithDistance(job.toObject(), userId);
      }
      return job;
    }

    const browsable = [JobStatus.OPEN, JobStatus.RECEIVING_QUOTES].includes(job.status);
    if (!browsable || !roles.includes('helper')) {
      throw new ForbiddenException('Bạn không có quyền xem công việc này');
    }
    await this.requireVerifiedHelper(userId);
    const preview = job.toObject() as any;
    const a = preview.address ?? {};
    preview.address = {
      ward: a.ward,
      district: a.district,
      city: a.city,
      full_address: [a.ward, a.district, a.city].filter(Boolean).join(', '),
      location: a.location && {
        type: 'Point',
        coordinates: a.location.coordinates.map((c: number) => Math.round(c * 100) / 100),
      },
    };
    if (preview.customer_id && typeof preview.customer_id === 'object') {
      preview.customer_id = {
        _id: preview.customer_id._id,
        full_name: preview.customer_id.full_name,
        avatar: preview.customer_id.avatar,
      };
    }
    return this.enrichJobWithDistance(preview, userId);
  }

  private async enrichJobWithDistance(jobObj: any, helperId: string) {
    const helperProfile = await this.helperModel
      .findOne({ user_id: new Types.ObjectId(helperId) })
      .select('location')
      .lean()
      .exec();
    const helperCoords = helperProfile?.location?.coordinates;
    const jobCoords = jobObj.address?.location?.coordinates;
    if (helperCoords && jobCoords) {
      const route = await this.routingService.getRoute(
        helperCoords[1],
        helperCoords[0],
        jobCoords[1],
        jobCoords[0],
      );
      jobObj.distance_km = route.distance_km;
      jobObj.estimated_minutes = route.estimated_minutes;
    }
    return jobObj;
  }

  // ─── Helper: Submit quote ─────────────────────────────────────────────────

  async submitQuote(helperId: string, jobId: string, dto: CreateQuoteDto): Promise<QuoteDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    const helperProfile = await this.helperModel
      .findOne({ user_id: new Types.ObjectId(helperId) })
      .populate('user_id', 'full_name')
      .exec();
    if (!helperProfile || helperProfile.verification_status !== VerificationStatus.APPROVED) {
      throw new ForbiddenException(
        'Tài khoản của bạn chưa hoàn tất xác thực danh tính (e-KYC). Vui lòng xác thực KYC để nhận việc và gửi báo giá.',
      );
    }

    if (job.status !== JobStatus.OPEN && job.status !== JobStatus.RECEIVING_QUOTES) {
      throw new BadRequestException('Job không còn nhận báo giá');
    }

    if (job.customer_id.toString() === helperId) {
      throw new BadRequestException('Bạn không thể tự gửi báo giá cho đơn của chính mình');
    }

    // Kiểm tra trùng lịch hẹn của thợ
    await this.checkHelperScheduleConflict(
      helperId,
      job.preferred_date,
      job.preferred_time_start,
      jobId,
    );

    const existing = await this.quoteModel
      .findOne({
        job_id: new Types.ObjectId(jobId),
        helper_id: new Types.ObjectId(helperId),
      })
      .exec();
    if (existing) throw new ConflictException('Bạn đã gửi báo giá cho job này');

    const materialsTotal = dto.materials_cost ?? 0;
    const totalPrice = dto.labor_cost + materialsTotal;
    const service = await this.serviceModel
      .findById(job.service_id)
      .select('platform_fee_percent')
      .lean()
      .exec();
    const platformFeeRate =
      typeof service?.platform_fee_percent === 'number'
        ? service.platform_fee_percent / 100
        : PLATFORM_FEE_BY_SERVICE.default;
    const platformFee = Math.round(totalPrice * platformFeeRate);
    const helperReceives = totalPrice - platformFee;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + JOB_QUOTE_EXPIRY_HOURS);

    const quote = await this.quoteModel.create({
      job_id: new Types.ObjectId(jobId),
      helper_id: new Types.ObjectId(helperId),
      labor_cost: dto.labor_cost,
      materials_cost: materialsTotal,
      total_price: totalPrice,
      platform_fee: platformFee,
      helper_receives: helperReceives,
      estimated_duration: dto.estimated_duration,
      warranty_days: dto.warranty_days ?? 0,
      notes: dto.notes,
      materials_breakdown: dto.materials_breakdown ?? [],
      available_date: dto.available_date ? new Date(dto.available_date) : undefined,
      available_time_start: dto.available_time_start,
      available_time_end: dto.available_time_end,
      expires_at: expiresAt,
    });

    await this.jobModel
      .findByIdAndUpdate(jobId, {
        status: JobStatus.RECEIVING_QUOTES,
        $inc: { total_quotes_count: 1 },
      })
      .exec();

    await this.helperModel
      .updateOne({ user_id: new Types.ObjectId(helperId) }, { $inc: { total_quotes_sent: 1 } })
      .exec();

    const quotePayload = {
      job_id: jobId,
      quote_id: String(quote._id),
      helper_id: helperId,
      total_price: totalPrice,
    };
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.QUOTE_RECEIVED, quotePayload);

    await this.notificationsService.notifyNewQuote(
      String(job.customer_id),
      (helperProfile.user_id as unknown as { full_name?: string })?.full_name ?? 'Thợ',
      job.title,
      jobId,
    );

    return quote;
  }

  // ─── Get quotes for a job ─────────────────────────────────────────────────

  async getJobQuotes(jobId: string, requesterId: string, requesterRole: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    if (requesterRole === 'customer') {
      if (job.customer_id.toString() !== requesterId) throw new ForbiddenException();
    }

    const query: Record<string, unknown> = {
      job_id: new Types.ObjectId(jobId),
      status: QuoteStatus.PENDING,
    };
    if (requesterRole === 'helper') {
      query['helper_id'] = new Types.ObjectId(requesterId);
    }

    const quotes = await this.quoteModel
      .find(query)
      .populate('helper_id', 'full_name avatar')
      .exec();
    if (requesterRole === 'helper') return quotes;

    const helperIds = quotes.map(
      q => (q.helper_id as unknown as { _id: Types.ObjectId })?._id ?? q.helper_id,
    );
    const helperProfiles = await this.helperModel
      .find({ user_id: { $in: helperIds }, verification_status: VerificationStatus.APPROVED })
      .select(
        'user_id location rating total_reviews completed_jobs years_experience completion_rate cancellation_rate risk_score',
      )
      .lean()
      .exec();
    const profileMap = new Map(helperProfiles.map(h => [String(h.user_id), h]));

    const validQuotes = quotes.filter(q =>
      profileMap.has(
        String((q.helper_id as unknown as { _id: Types.ObjectId })?._id ?? q.helper_id),
      ),
    );

    const jobCoords = job.address?.location?.coordinates; // [lng, lat]
    const maxPrice = Math.max(...validQuotes.map(q => q.total_price || 0), 1);

    const scored = validQuotes.map(q => {
      const hId = String((q.helper_id as unknown as { _id: Types.ObjectId })?._id ?? q.helper_id);
      const profile = profileMap.get(hId);
      let score = 0;
      let dist: number | null = null;

      if (profile) {
        if (jobCoords && profile.location?.coordinates) {
          dist = this.haversineKm(
            jobCoords[1],
            jobCoords[0],
            profile.location.coordinates[1],
            profile.location.coordinates[0],
          );
          score += Math.max(0, 100 - (dist / QUOTE_SERVICE_RADIUS_KM) * 100) * 0.4;
        }

        const ratingScore = ((profile.rating || 0) / 5) * 100;
        score += ratingScore * 0.25;
        score += (profile.completion_rate ?? 100) * 0.15;

        const expScore = Math.min(
          100,
          ((profile.completed_jobs || 0) / 50) * 60 + ((profile.years_experience || 0) / 10) * 40,
        );
        score += expScore * 0.1;

        // Trừ điểm ưu tiên nếu thợ có risk_score cao
        score -= (profile.risk_score ?? 0) * 0.15;
      }

      const priceScore = (1 - (q.total_price || 0) / maxPrice) * 100;
      score += priceScore * 0.1;

      const tier = dist === null ? 2 : dist <= QUOTE_SERVICE_RADIUS_KM ? 0 : 1;
      return { quote: q, score, dist, tier };
    });

    scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.tier === 1) return (a.dist as number) - (b.dist as number);
      return b.score - a.score || (a.dist ?? 0) - (b.dist ?? 0);
    });

    const helperDestinations = scored
      .map(s => {
        const hId = String(
          (s.quote.helper_id as unknown as { _id: Types.ObjectId })?._id ?? s.quote.helper_id,
        );
        const profile = profileMap.get(hId);
        if (jobCoords && profile?.location?.coordinates) {
          return {
            id: hId,
            lat: profile.location.coordinates[1],
            lng: profile.location.coordinates[0],
          };
        }
        return null;
      })
      .filter((d): d is { id: string; lat: number; lng: number } => d !== null);

    const routeMap =
      jobCoords && helperDestinations.length
        ? await this.routingService.getRoutesBatch(jobCoords[1], jobCoords[0], helperDestinations)
        : new Map();

    return scored.map(s => {
      const hId = String(
        (s.quote.helper_id as unknown as { _id: Types.ObjectId })?._id ?? s.quote.helper_id,
      );
      const profile = profileMap.get(hId);
      const obj = s.quote.toObject();
      const route = routeMap.get(hId);
      if (route) {
        (obj as any).distance_km = route.distance_km;
        (obj as any).estimated_minutes = route.estimated_minutes;
      }
      (obj as any).helper_rating = profile?.rating ?? 0;
      (obj as any).helper_completed_jobs = profile?.completed_jobs ?? 0;
      return obj;
    });
  }

  // ─── Customer: Select quote → create Contract ─────────────────────────────

  async selectQuote(
    customerId: string,
    jobId: string,
    dto: SelectQuoteDto,
  ): Promise<{ job: JobDocument; contract: ContractDocument }> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.customer_id.toString() !== customerId) throw new ForbiddenException();
    if (job.status !== JobStatus.RECEIVING_QUOTES && job.status !== JobStatus.OPEN) {
      throw new BadRequestException('Job không ở trạng thái nhận báo giá');
    }

    const quote = await this.quoteModel.findById(dto.quote_id).exec();
    if (!quote || quote.job_id.toString() !== jobId)
      throw new NotFoundException('Quote không tồn tại');
    if (quote.status !== QuoteStatus.PENDING)
      throw new BadRequestException('Quote không còn hiệu lực');
    if (!(await this.isVerifiedHelper(quote.helper_id))) {
      throw new BadRequestException('Thợ này chưa được xác minh e-KYC, không thể chọn báo giá');
    }

    // Kiểm tra trùng lịch trước khi chốt hợp đồng
    await this.checkHelperScheduleConflict(
      quote.helper_id,
      job.preferred_date,
      job.preferred_time_start,
      jobId,
    );

    const claimed = await this.jobModel
      .findOneAndUpdate(
        { _id: job._id, status: job.status, helper_id: null },
        { $set: { helper_id: quote.helper_id } },
        { new: true },
      )
      .exec();
    if (!claimed) throw new ConflictException('Job đã chọn báo giá');

    quote.status = QuoteStatus.ACCEPTED;
    await quote.save();

    await this.quoteModel
      .updateMany(
        { job_id: new Types.ObjectId(jobId), _id: { $ne: new Types.ObjectId(dto.quote_id) } },
        { status: QuoteStatus.REJECTED },
      )
      .exec();

    const contract = await this.contractModel.create({
      job_id: new Types.ObjectId(jobId),
      quote_id: new Types.ObjectId(dto.quote_id),
      customer_id: new Types.ObjectId(customerId),
      helper_id: quote.helper_id,
      labor_cost: quote.labor_cost,
      materials_cost: quote.materials_cost,
      total_price: quote.total_price,
      platform_fee: quote.platform_fee,
      helper_receives: quote.helper_receives,
      warranty_days: quote.warranty_days,
      scheduled_at: new Date(dto.scheduled_at),
      signed_by_customer_at: new Date(),
    });

    this.addEvent(job, JobStatus.CONFIRMED, customerId, 'customer', 'Đã chọn báo giá');
    job.selected_quote_id = quote._id as Types.ObjectId;
    job.helper_id = quote.helper_id;
    await job.save();

    const helperId = String(quote.helper_id);

    await this.helperModel
      .updateOne({ user_id: quote.helper_id }, { $inc: { accepted_quotes: 1 } })
      .exec();

    await this.chatService.getOrCreateConversation(jobId, [customerId, helperId]);

    this.gateway.emitToUser(helperId, SOCKET_EVENTS.QUOTE_ACCEPTED, {
      job_id: jobId,
      quote_id: String(quote._id),
      contract_id: String(contract._id),
    });

    this.emitJobStatusChange(job);

    await this.notificationsService.notifyQuoteAccepted(helperId, job.title, jobId);

    return { job, contract };
  }

  // ─── Helper: Propose Contract Amendment (Phụ lục phát sinh vật tư/chi phí) ─

  async proposeContractAmendment(
    helperId: string,
    jobId: string,
    dto: ProposeAmendmentDto,
  ): Promise<ContractDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) {
      throw new ForbiddenException('Chỉ thợ phụ trách đơn mới có quyền đề xuất phát sinh chi phí');
    }
    if (
      ![JobStatus.CONFIRMED, JobStatus.HELPER_ARRIVED, JobStatus.IN_PROGRESS].includes(job.status)
    ) {
      throw new BadRequestException(
        'Chỉ có thể đề xuất phát sinh vật tư/chi phí khi đã đến nơi hoặc đang làm việc',
      );
    }

    const addLabor = Math.max(0, Number(dto.additional_labor_cost ?? 0));
    const addMat = Math.max(0, Number(dto.additional_materials_cost ?? 0));
    if (addLabor + addMat <= 0) {
      throw new BadRequestException('Tổng chi phí phát sinh phải lớn hơn 0₫');
    }

    const contract = await this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();
    if (!contract) throw new NotFoundException('Hợp đồng không tồn tại');

    contract.amendments.push({
      proposed_by: new Types.ObjectId(helperId),
      proposed_role: 'helper',
      additional_labor_cost: addLabor,
      additional_materials_cost: addMat,
      reason: dto.reason.trim(),
      photos: dto.photos ?? [],
      status: 'pending',
      created_at: new Date(),
    });
    await contract.save();

    const latestAmendment = contract.amendments[contract.amendments.length - 1];
    const payload = {
      job_id: jobId,
      contract_id: String(contract._id),
      amendment: latestAmendment,
    };
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.CONTRACT_AMENDED, payload);
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.CONTRACT_AMENDED, payload);

    await this.notificationsService
      .create({
        userId: String(job.customer_id),
        type: NOTIFICATION_TYPES.SYSTEM,
        title: '📋 Đề xuất phát sinh vật tư / chi phí',
        body: `Thợ đề xuất bổ sung +${(addLabor + addMat).toLocaleString('vi-VN')}₫ cho "${job.title}". Lý do: ${dto.reason}`,
        payload: { job_id: jobId },
      })
      .catch(() => undefined);

    return contract;
  }

  // ─── Customer: Respond to Contract Amendment (Đồng ý / Từ chối) ────────────

  async respondContractAmendment(
    customerId: string,
    jobId: string,
    amendmentId: string,
    dto: RespondAmendmentDto,
  ): Promise<ContractDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.customer_id.toString() !== customerId) {
      throw new ForbiddenException('Chỉ chủ đơn hàng mới có quyền duyệt phụ lục hợp đồng');
    }

    const contract = await this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();
    if (!contract) throw new NotFoundException('Hợp đồng không tồn tại');

    const amendment = contract.amendments.find(a => String(a._id) === amendmentId);
    if (!amendment) throw new NotFoundException('Không tìm thấy yêu cầu thay đổi hợp đồng');
    if (amendment.status !== 'pending') {
      throw new BadRequestException('Yêu cầu này đã được xử lý trước đó');
    }

    amendment.status = dto.action === 'accept' ? 'accepted' : 'rejected';
    amendment.responded_at = new Date();

    if (dto.action === 'accept') {
      const extraLabor = amendment.additional_labor_cost || 0;
      const extraMaterials = amendment.additional_materials_cost || 0;
      const extraTotal = extraLabor + extraMaterials;

      contract.labor_cost += extraLabor;
      contract.materials_cost += extraMaterials;
      contract.total_price += extraTotal;
      contract.platform_fee = Math.round(contract.total_price * PLATFORM_FEE_BY_SERVICE.default);
      contract.helper_receives = contract.total_price - contract.platform_fee;

      this.addEvent(
        job,
        job.status,
        customerId,
        'customer',
        `Đồng ý phụ lục phát sinh +${extraTotal.toLocaleString('vi-VN')}₫ (${amendment.reason})`,
      );
      await job.save();
    }

    await contract.save();

    const payload = {
      job_id: jobId,
      contract_id: String(contract._id),
      amendment_id: amendmentId,
      status: amendment.status,
      total_price: contract.total_price,
    };
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.CONTRACT_AMENDMENT_ACCEPTED, payload);
    if (job.helper_id) {
      this.gateway.emitToUser(
        String(job.helper_id),
        SOCKET_EVENTS.CONTRACT_AMENDMENT_ACCEPTED,
        payload,
      );
      await this.notificationsService
        .create({
          userId: String(job.helper_id),
          type: NOTIFICATION_TYPES.SYSTEM,
          title:
            dto.action === 'accept'
              ? '✅ Khách đã duyệt chi phí phát sinh'
              : '❌ Khách từ chối chi phí phát sinh',
          body:
            dto.action === 'accept'
              ? `Tổng giá trị hợp đồng mới: ${contract.total_price.toLocaleString('vi-VN')}₫`
              : `Khách hàng không đồng ý khoản phát sinh (${amendment.reason}).`,
          payload: { job_id: jobId },
        })
        .catch(() => undefined);
    }

    return contract;
  }

  // ─── Helper: Start navigation ─────────────────────────────────────────────

  async helperOnTheWay(helperId: string, jobId: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.HELPER_ON_THE_WAY);
    this.addEvent(job, JobStatus.HELPER_ON_THE_WAY, helperId, 'helper');
    await job.save();
    await this.setHelperBusy(helperId, true);

    this.emitJobStatusChange(job);
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.HELPER_ON_THE_WAY, {
      job_id: jobId,
      helper_id: helperId,
    });

    await this.notificationsService.create({
      userId: String(job.customer_id),
      type: NOTIFICATION_TYPES.HELPER_ON_THE_WAY,
      title: 'Người giúp việc đang trên đường',
      body: 'Người giúp việc đang di chuyển đến nơi của bạn.',
      payload: { job_id: jobId },
    });

    return job;
  }

  // ─── Helper: Arrived ──────────────────────────────────────────────────────

  async helperArrived(helperId: string, jobId: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.HELPER_ARRIVED);
    this.addEvent(job, JobStatus.HELPER_ARRIVED, helperId, 'helper');
    await job.save();

    this.emitJobStatusChange(job);
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.HELPER_ARRIVED, {
      job_id: jobId,
      helper_id: helperId,
    });

    await this.notificationsService.create({
      userId: String(job.customer_id),
      type: NOTIFICATION_TYPES.HELPER_ARRIVED,
      title: 'Người giúp việc đã đến',
      body: 'Người giúp việc đã có mặt tại địa điểm của bạn.',
      payload: { job_id: jobId },
    });

    return job;
  }

  // ─── Helper: Start job ────────────────────────────────────────────────────

  async startJob(helperId: string, jobId: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.IN_PROGRESS);
    this.addEvent(job, JobStatus.IN_PROGRESS, helperId, 'helper', 'Bắt đầu làm việc');
    await job.save();

    this.emitJobStatusChange(job);
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.JOB_STARTED, {
      job_id: jobId,
      started_at: new Date().toISOString(),
    });

    return job;
  }

  // ─── Helper: Complete (upload evidence) ──────────────────────────────────

  async completeByHelper(
    helperId: string,
    jobId: string,
    dto: CompleteJobDto,
  ): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.PENDING_REVIEW);
    if (dto.completion_photos?.length) {
      job.completion_photos = dto.completion_photos;
    }
    if (dto.completion_videos?.length) {
      job.completion_videos = dto.completion_videos;
    }
    if (dto.completion_notes) {
      job.completion_notes = dto.completion_notes;
    }
    this.addEvent(job, JobStatus.PENDING_REVIEW, helperId, 'helper', 'Upload ảnh/video hoàn thành');
    await job.save();
    await this.setHelperBusy(helperId, false);

    this.emitJobStatusChange(job);
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.JOB_COMPLETION_UPLOADED, {
      job_id: jobId,
      completion_photos: dto.completion_photos ?? [],
      completion_videos: dto.completion_videos ?? [],
      completion_notes: dto.completion_notes,
    });

    await this.notificationsService.notifyJobCompleted(String(job.customer_id), job.title, jobId);

    return job;
  }

  // ─── Customer: Approve completion (Escrow Release vs Cash Commission) ─────

  async approveCompletion(
    customerId: string,
    jobId: string,
    dto: ReviewJobDto,
  ): Promise<JobDocument> {
    const existing = await this.jobModel.findById(jobId).exec();
    if (!existing) throw new NotFoundException('Job không tồn tại');
    if (existing.customer_id.toString() !== customerId) throw new ForbiddenException();
    this.validateTransition(existing.status, JobStatus.COMPLETED);

    const effectivePaymentMethod = dto.payment_method || existing.payment_method || 'vietqr';

    const job = await this.jobModel
      .findOneAndUpdate(
        { _id: existing._id, status: existing.status },
        {
          $set: {
            status: JobStatus.COMPLETED,
            payment_status: PaymentStatus.PAID,
            payment_method: effectivePaymentMethod,
            customer_rating: dto.rating,
            customer_review: dto.review,
          },
          $push: {
            events: {
              status: JobStatus.COMPLETED,
              note: `Nghiệm thu hoàn thành (${effectivePaymentMethod.toUpperCase()})`,
              actor_id: new Types.ObjectId(customerId),
              actor_role: 'customer',
              timestamp: new Date(),
            },
          },
        },
        { new: true },
      )
      .exec();
    if (!job) throw new ConflictException('Công việc đã được nghiệm thu');

    await this.contractModel
      .findOneAndUpdate(
        { job_id: new Types.ObjectId(jobId) },
        { status: ContractStatus.COMPLETED, completed_at: new Date() },
      )
      .exec();

    if (job.helper_id) {
      await this.helperModel
        .updateOne({ user_id: job.helper_id }, { $inc: { completed_jobs: 1 } })
        .exec();
    }

    if (job.helper_id) {
      const contract = await this.contractModel
        .findOne({ job_id: new Types.ObjectId(jobId) })
        .exec();

      if (contract) {
        if (effectivePaymentMethod === 'cash') {
          // Đơn Tiền mặt: Thợ đã thu 100% tiền mặt trực tiếp từ khách -> Khấu trừ 15% phí sàn từ Ví thợ
          await this.paymentsService.deductCommissionForCashJob(
            String(job.helper_id),
            jobId,
            contract.platform_fee,
            contract.helper_receives,
          );
        } else if (contract.helper_receives > 0) {
          // Đơn Online Escrow (VietQR / MoMo): Giải ngân 85% thực nhận vào Ví thợ
          await this.paymentsService.creditHelper(
            String(job.helper_id),
            jobId,
            contract.helper_receives,
          );
        }
      }
    }

    this.emitJobStatusChange(job);
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.JOB_COMPLETED, {
      job_id: jobId,
      completed_at: new Date().toISOString(),
    });
    if (job.helper_id) {
      this.gateway.emitToUser(String(job.helper_id), SOCKET_EVENTS.JOB_COMPLETED, {
        job_id: jobId,
      });
    }

    if (job.helper_id) {
      await this.notificationsService.create({
        userId: String(job.helper_id),
        type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
        title:
          effectivePaymentMethod === 'cash'
            ? 'Hoàn tất đơn Tiền mặt!'
            : 'Tiền công đã cộng vào ví!',
        body:
          effectivePaymentMethod === 'cash'
            ? `Công việc "${job.title}" đã nghiệm thu. Phí nền tảng đã được đối soát.`
            : `Công việc "${job.title}" đã hoàn thành. Thu nhập đã được giải ngân vào ví của bạn.`,
        payload: { job_id: jobId },
      });
    }

    return job;
  }

  // ─── Customer / Helper: Open Dispute (Báo sự cố / Khiếu nại nghiệm thu) ──

  async openDispute(
    actorId: string,
    actorRole: string,
    jobId: string,
    dto: OpenDisputeDto,
  ): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    const isCustomer = job.customer_id.toString() === actorId;
    const isHelper = job.helper_id?.toString() === actorId;
    if (!isCustomer && !isHelper) {
      throw new ForbiddenException('Bạn không có quyền mở khiếu nại cho công việc này');
    }

    this.validateTransition(job.status, JobStatus.DISPUTED);

    job.dispute_reason = dto.reason.trim();
    job.dispute_photos = dto.photos ?? [];
    job.dispute_opened_by = new Types.ObjectId(actorId);
    job.dispute_opened_at = new Date();
    this.addEvent(
      job,
      JobStatus.DISPUTED,
      actorId,
      isCustomer ? 'customer' : actorRole,
      `Khiếu nại: ${dto.reason.trim()}`,
    );
    await job.save();

    await this.contractModel
      .findOneAndUpdate({ job_id: new Types.ObjectId(jobId) }, { status: ContractStatus.DISPUTED })
      .exec();

    if (job.helper_id) {
      await this.helperModel
        .updateOne({ user_id: job.helper_id }, { $inc: { dispute_count: 1, risk_score: 10 } })
        .exec();
    }

    this.emitJobStatusChange(job);

    const targetNotifyId = isCustomer ? String(job.helper_id) : String(job.customer_id);
    if (targetNotifyId) {
      await this.notificationsService
        .create({
          userId: targetNotifyId,
          type: NOTIFICATION_TYPES.SYSTEM,
          title: '⚠️ Đơn hàng đang có khiếu nại / tranh chấp',
          body: `Công việc "${job.title}" đã chuyển sang trạng thái chờ Admin phân xử. Lý do: ${dto.reason}`,
          payload: { job_id: jobId },
        })
        .catch(() => undefined);
    }

    return job;
  }

  // ─── Admin: Resolve Dispute (Phân xử bằng chứng & Hoàn tiền / Giải ngân) ─

  async resolveDispute(
    adminId: string,
    isAdmin: boolean,
    jobId: string,
    dto: ResolveDisputeDto,
  ): Promise<JobDocument> {
    if (!isAdmin) {
      throw new ForbiddenException('Chỉ Quản trị viên (Admin) mới có quyền phân xử tranh chấp');
    }

    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.status !== JobStatus.DISPUTED) {
      throw new BadRequestException('Đơn hàng này không ở trạng thái tranh chấp (disputed)');
    }

    const contract = await this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();
    const totalPrice = contract?.total_price ?? 0;
    const defaultHelperReceives = contract?.helper_receives ?? 0;

    let refundAmount = 0;
    let helperPayout = 0;
    let nextStatus = JobStatus.COMPLETED;

    if (dto.action === 'refund_full') {
      nextStatus = JobStatus.REFUNDED;
      refundAmount = totalPrice;
      helperPayout = 0;
      job.payment_status = PaymentStatus.REFUNDED;

      if (refundAmount > 0) {
        await this.paymentsService.refundCustomer(
          String(job.customer_id),
          jobId,
          refundAmount,
          dto.admin_note,
        );
      }
      if (job.helper_id) {
        await this.helperModel
          .updateOne({ user_id: job.helper_id }, { $inc: { risk_score: 15 } })
          .exec();
      }
    } else if (dto.action === 'refund_partial') {
      nextStatus = JobStatus.COMPLETED;
      refundAmount = Math.min(totalPrice, Math.max(0, Number(dto.refund_amount ?? 0)));
      const remaining = Math.max(0, totalPrice - refundAmount);
      helperPayout = Math.round(remaining * (1 - PLATFORM_FEE_BY_SERVICE.default));
      job.payment_status = PaymentStatus.PAID;

      if (refundAmount > 0) {
        await this.paymentsService.refundCustomer(
          String(job.customer_id),
          jobId,
          refundAmount,
          dto.admin_note,
        );
      }
      if (job.helper_id && helperPayout > 0) {
        await this.paymentsService.creditHelper(String(job.helper_id), jobId, helperPayout);
      }
    } else {
      // release_to_helper: bác khiếu nại, giải ngân cho thợ
      nextStatus = JobStatus.COMPLETED;
      refundAmount = 0;
      helperPayout = defaultHelperReceives;
      job.payment_status = PaymentStatus.PAID;

      if (job.helper_id) {
        if (job.payment_method === 'cash' && contract) {
          await this.paymentsService.deductCommissionForCashJob(
            String(job.helper_id),
            jobId,
            contract.platform_fee,
            contract.helper_receives,
          );
        } else if (helperPayout > 0) {
          await this.paymentsService.creditHelper(String(job.helper_id), jobId, helperPayout);
        }
        // Khôi phục lại 10 điểm risk_score đã tạm cộng khi mở dispute
        await this.helperModel
          .updateOne(
            { user_id: job.helper_id, risk_score: { $gte: 10 } },
            { $inc: { risk_score: -10 } },
          )
          .exec();
      }
    }

    job.dispute_resolution = {
      action: dto.action,
      refund_amount: refundAmount,
      helper_payout: helperPayout,
      admin_note: dto.admin_note,
      resolved_by: new Types.ObjectId(adminId),
      resolved_at: new Date(),
    };
    this.addEvent(
      job,
      nextStatus,
      adminId,
      'admin',
      `Phân xử tranh chấp (${dto.action}): ${dto.admin_note}`,
    );
    await job.save();

    if (contract) {
      contract.status =
        nextStatus === JobStatus.REFUNDED ? ContractStatus.CANCELLED : ContractStatus.COMPLETED;
      contract.completed_at = new Date();
      await contract.save();
    }

    this.emitJobStatusChange(job);

    await this.notificationsService
      .create({
        userId: String(job.customer_id),
        type: NOTIFICATION_TYPES.SYSTEM,
        title: '⚖️ Kết quả phân xử khiếu nại từ Admin',
        body: `Đơn "${job.title}": ${dto.admin_note}${refundAmount > 0 ? ` (Hoàn ví: +${refundAmount.toLocaleString('vi-VN')}₫)` : ''}`,
        payload: { job_id: jobId },
      })
      .catch(() => undefined);

    if (job.helper_id) {
      await this.notificationsService
        .create({
          userId: String(job.helper_id),
          type: NOTIFICATION_TYPES.SYSTEM,
          title: '⚖️ Kết quả phân xử khiếu nại từ Admin',
          body: `Đơn "${job.title}": ${dto.admin_note}${helperPayout > 0 ? ` (Nhận về ví: +${helperPayout.toLocaleString('vi-VN')}₫)` : ''}`,
          payload: { job_id: jobId },
        })
        .catch(() => undefined);
    }

    return job;
  }

  // ─── Cancel job ───────────────────────────────────────────────────────────

  async cancelJob(
    actorId: string,
    actorRole: string,
    jobId: string,
    dto: CancelJobDto,
  ): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    if (actorRole !== 'admin') {
      if (actorRole === 'customer' && job.customer_id.toString() !== actorId) {
        throw new ForbiddenException();
      }
      if (actorRole === 'helper' && job.helper_id?.toString() !== actorId) {
        throw new ForbiddenException();
      }
      if (actorRole !== 'customer' && actorRole !== 'helper') {
        throw new ForbiddenException();
      }
    }

    const previousStatus = job.status;
    this.validateTransition(job.status, JobStatus.CANCELLED);
    job.cancellation_reason = dto.reason;
    job.cancelled_by = new Types.ObjectId(actorId);
    this.addEvent(job, JobStatus.CANCELLED, actorId, actorRole, `Hủy: ${dto.reason}`);

    // Nếu Thợ tự ý hủy đơn sau khi đã chốt hợp đồng (confirmed / helper_on_the_way) -> phạt điểm rủi ro (No-Show / Late Cancel)
    if (
      actorRole === 'helper' &&
      job.helper_id &&
      [JobStatus.CONFIRMED, JobStatus.HELPER_ON_THE_WAY].includes(previousStatus)
    ) {
      await this.helperModel
        .updateOne(
          { user_id: job.helper_id },
          { $inc: { late_cancellation_count: 1, risk_score: 15, cancellation_rate: 5 } },
        )
        .exec();
    }

    await this.quoteModel
      .updateMany(
        { job_id: new Types.ObjectId(jobId), status: QuoteStatus.PENDING },
        { status: QuoteStatus.REJECTED },
      )
      .exec();

    await job.save();
    if (job.helper_id) await this.setHelperBusy(job.helper_id, false);

    this.emitJobStatusChange(job);
    const cancelPayload = {
      job_id: jobId,
      cancelled_by: actorRole,
      reason: dto.reason,
    };
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.JOB_CANCELLED, cancelPayload);
    if (job.is_sos) {
      this.gateway.emitToJob(jobId, SOCKET_EVENTS.SOS_CANCELLED, cancelPayload);
    }

    if (actorRole === 'admin') {
      await this.notificationsService
        .create({
          userId: String(job.customer_id),
          type: NOTIFICATION_TYPES.SYSTEM,
          title: 'Đơn hàng đã bị hủy bởi Quản trị viên',
          body: `Công việc "${job.title}" đã bị hủy. Lý do: ${dto.reason}`,
          payload: { job_id: jobId },
        })
        .catch(() => undefined);
      if (job.helper_id) {
        await this.notificationsService
          .create({
            userId: String(job.helper_id),
            type: NOTIFICATION_TYPES.SYSTEM,
            title: 'Đơn hàng đã bị hủy bởi Quản trị viên',
            body: `Công việc "${job.title}" đã bị hủy. Lý do: ${dto.reason}`,
            payload: { job_id: jobId },
          })
          .catch(() => undefined);
      }
    } else if (actorRole === 'customer' && job.helper_id) {
      await this.notificationsService.create({
        userId: String(job.helper_id),
        type: NOTIFICATION_TYPES.SYSTEM,
        title: 'Công việc bị hủy',
        body: `Khách hàng đã hủy công việc "${job.title}"`,
        payload: { job_id: jobId },
      });
    } else if (actorRole === 'helper') {
      await this.notificationsService.create({
        userId: String(job.customer_id),
        type: NOTIFICATION_TYPES.SYSTEM,
        title: 'Công việc bị hủy',
        body: `Người giúp việc đã hủy công việc "${job.title}"`,
        payload: { job_id: jobId },
      });
    }

    return job;
  }

  // ─── Helper: Get available jobs (job feed) ────────────────────────────────

  async getAvailableJobs(helperId: string, serviceId?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {
      status: { $in: [JobStatus.OPEN, JobStatus.RECEIVING_QUOTES] },
      expires_at: { $gt: new Date() },
    };
    if (serviceId && Types.ObjectId.isValid(serviceId)) {
      query['service_id'] = new Types.ObjectId(serviceId);
    }
    const skip = (page - 1) * limit;
    const [jobs, total, helperProfile] = await Promise.all([
      this.jobModel
        .find(query)
        .populate('service_id', 'name slug icon')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.jobModel.countDocuments(query).exec(),
      this.helperModel
        .findOne({ user_id: new Types.ObjectId(helperId) })
        .select('location')
        .lean()
        .exec(),
    ]);

    const helperCoords = helperProfile?.location?.coordinates;
    const jobObjects = jobs.map(job => job.toObject());

    if (helperCoords) {
      const destinations = jobObjects
        .filter(obj => obj.address?.location?.coordinates)
        .map(obj => ({
          id: String(obj._id),
          lat: obj.address.location.coordinates[1],
          lng: obj.address.location.coordinates[0],
        }));

      const routes = await this.routingService.getRoutesBatch(
        helperCoords[1],
        helperCoords[0],
        destinations,
      );

      for (const obj of jobObjects) {
        const route = routes.get(String(obj._id));
        if (route) {
          (obj as any).distance_km = route.distance_km;
          (obj as any).estimated_minutes = route.estimated_minutes;
        }
      }

      jobObjects.sort((a, b) => ((a as any).distance_km ?? 999) - ((b as any).distance_km ?? 999));
    }

    return { jobs: jobObjects, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ─── Helper: Get own active job ───────────────────────────────────────────

  async getHelperJobs(helperId: string, status?: string) {
    const query: Record<string, unknown> = { helper_id: new Types.ObjectId(helperId) };
    if (status) {
      const statuses = status
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      query['status'] = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    return this.jobModel
      .find(query)
      .populate('service_id', 'name slug icon')
      .populate('customer_id', 'full_name phone avatar')
      .sort({ created_at: -1 })
      .exec();
  }

  // ─── Get contract for job ─────────────────────────────────────────────────

  async getContract(
    jobId: string,
    requesterId: string,
    isAdmin = false,
  ): Promise<ContractDocument> {
    const contract = await this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();
    if (!contract) throw new NotFoundException('Hợp đồng không tồn tại');
    if (
      !isAdmin &&
      contract.customer_id.toString() !== requesterId &&
      contract.helper_id.toString() !== requesterId
    ) {
      throw new ForbiddenException();
    }
    return contract;
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

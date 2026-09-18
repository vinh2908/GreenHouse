import {
  Injectable,
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
} from './dto/job.dto';
import {
  JobStatus,
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

@Injectable()
export class JobsService {
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

  private validateTransition(from: JobStatus, to: JobStatus) {
    if (!isValidJobTransition(from, to)) {
      throw new BadRequestException(`Không thể chuyển trạng thái từ "${from}" sang "${to}"`);
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
    // Also emit to customer's personal room
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.JOB_STATUS_CHANGED, payload);
    // Emit to helper's personal room (if assigned)
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

    // Realtime: broadcast new job to nearby helpers (handled by feed polling for MVP)
    this.gateway.emitToUser(customerId, SOCKET_EVENTS.JOB_CREATED, {
      job_id: String(job._id),
      status: job.status,
    });

    return job;
  }

  // ─── Customer: Create SOS Emergency Job ───────────────────────────────────

  async createSosJob(customerId: string, dto: CreateSosJobDto): Promise<JobDocument> {
    // 1. Tự động tra cứu Service theo category
    const serviceSlug = dto.category || 'electrician';
    let service = await this.serviceModel.findOne({ slug: serviceSlug }).exec();
    if (!service) {
      service = await this.serviceModel.findOne({}).exec();
    }
    if (!service) throw new BadRequestException('Hệ thống chưa có dịch vụ cứu hộ phù hợp');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2); // SOS đơn chỉ tồn tại trong 2h nếu không ai nhận

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

    // 2. Broadcast khẩn cấp tới TOÀN BỘ Thợ đang Online & Đã xác minh e-KYC
    const verifiedHelpers = await this.helperModel
      .find({
        status: HelperStatus.ONLINE,
        verification_status: VerificationStatus.APPROVED,
      })
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
      // Gửi notification khẩn cấp
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

    // Emit cho chính Customer
    this.gateway.emitToUser(customerId, SOCKET_EVENTS.JOB_CREATED, {
      job_id: String(job._id),
      is_sos: true,
      status: job.status,
    });

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

    const baseCost = 200000; // Giá công cứu hộ tối thiểu
    const surcharge = job.sos_surcharge || 100000;
    const totalPrice = baseCost + surcharge;
    const platformFee = Math.round(totalPrice * PLATFORM_FEE_BY_SERVICE.default);
    const helperReceives = totalPrice - platformFee;

    // 1. Tạo báo giá khẩn cấp tự động (Accepted Quote)
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

    // 2. Tạo hợp đồng khẩn cấp ngay lập tức
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

    // 3. Chuyển trạng thái Job sang CONFIRMED và gán Thợ
    this.addEvent(job, JobStatus.CONFIRMED, helperId, 'helper', 'Thợ đã nhận cứu hộ SOS');
    job.helper_id = new Types.ObjectId(helperId);
    job.selected_quote_id = quote._id as any;
    await job.save();

    // 3. Tự động tạo cuộc trò chuyện khẩn cấp
    await this.chatService.getOrCreateConversation(jobId, [String(job.customer_id), helperId]);

    // 4. Bắn Socket Realtime thông báo cho Khách hàng ngay lập tức
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

    // 5. Gửi thông báo cho Khách hàng
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

  // ─── Helper: Submit quote ─────────────────────────────────────────────────

  async submitQuote(helperId: string, jobId: string, dto: CreateQuoteDto): Promise<QuoteDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    if (job.status !== JobStatus.OPEN && job.status !== JobStatus.RECEIVING_QUOTES) {
      throw new BadRequestException('Job không còn nhận báo giá');
    }

    if (job.customer_id.toString() === helperId) {
      throw new BadRequestException('Bạn không thể tự gửi báo giá cho đơn của chính mình');
    }

    // Check existing quote from this helper
    const existing = await this.quoteModel
      .findOne({
        job_id: new Types.ObjectId(jobId),
        helper_id: new Types.ObjectId(helperId),
      })
      .exec();
    if (existing) throw new ConflictException('Bạn đã gửi báo giá cho job này');

    const materialsTotal = dto.materials_cost ?? 0;
    const totalPrice = dto.labor_cost + materialsTotal;
    const platformFeeRate = PLATFORM_FEE_BY_SERVICE.default;
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

    // Update job
    await this.jobModel
      .findByIdAndUpdate(jobId, {
        status: JobStatus.RECEIVING_QUOTES,
        $inc: { total_quotes_count: 1 },
      })
      .exec();

    // Realtime: notify customer a new quote arrived
    const quotePayload = {
      job_id: jobId,
      quote_id: String(quote._id),
      helper_id: helperId,
      total_price: totalPrice,
    };
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.QUOTE_RECEIVED, quotePayload);

    // Notification: push notification to customer
    await this.notificationsService.notifyNewQuote(
      String(job.customer_id),
      'Người giúp việc',
      job.title,
      jobId,
    );

    return quote;
  }

  // ─── Get quotes for a job ─────────────────────────────────────────────────

  async getJobQuotes(jobId: string, requesterId: string, requesterRole: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    // Customer can see all quotes for their job; helper sees own quote only
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

    return this.quoteModel
      .find(query)
      .populate('helper_id', 'full_name avatar')
      .sort({ total_price: 1 })
      .exec();
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

    // Mark quote as accepted
    quote.status = QuoteStatus.ACCEPTED;
    await quote.save();

    // Reject other quotes
    await this.quoteModel
      .updateMany(
        { job_id: new Types.ObjectId(jobId), _id: { $ne: new Types.ObjectId(dto.quote_id) } },
        { status: QuoteStatus.REJECTED },
      )
      .exec();

    // Create contract
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

    // Update job
    this.addEvent(job, JobStatus.CONFIRMED, customerId, 'customer', 'Đã chọn báo giá');
    job.selected_quote_id = quote._id as Types.ObjectId;
    job.helper_id = quote.helper_id;
    await job.save();

    // ── Phase 7: Realtime & Notifications ──────────────────────────────────

    const helperId = String(quote.helper_id);

    // Create chat conversation automatically
    await this.chatService.getOrCreateConversation(jobId, [customerId, helperId]);

    // Realtime: notify helper their quote was accepted
    this.gateway.emitToUser(helperId, SOCKET_EVENTS.QUOTE_ACCEPTED, {
      job_id: jobId,
      quote_id: String(quote._id),
      contract_id: String(contract._id),
    });

    // Realtime: emit job status change
    this.emitJobStatusChange(job);

    // Notification: push to helper
    await this.notificationsService.notifyQuoteAccepted(helperId, job.title, jobId);

    return { job, contract };
  }

  // ─── Helper: Start navigation ─────────────────────────────────────────────

  async helperOnTheWay(helperId: string, jobId: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.HELPER_ON_THE_WAY);
    this.addEvent(job, JobStatus.HELPER_ON_THE_WAY, helperId, 'helper');
    await job.save();

    // Realtime
    this.emitJobStatusChange(job);
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.HELPER_ON_THE_WAY, {
      job_id: jobId,
      helper_id: helperId,
    });

    // Notification
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

    // Realtime
    this.emitJobStatusChange(job);
    this.gateway.emitToUser(String(job.customer_id), SOCKET_EVENTS.HELPER_ARRIVED, {
      job_id: jobId,
      helper_id: helperId,
    });

    // Notification
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

    // Realtime
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

    // Realtime
    this.emitJobStatusChange(job);
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.JOB_COMPLETION_UPLOADED, {
      job_id: jobId,
      completion_photos: dto.completion_photos ?? [],
      completion_videos: dto.completion_videos ?? [],
      completion_notes: dto.completion_notes,
    });

    // Notification: ask customer to review/approve
    await this.notificationsService.notifyJobCompleted(String(job.customer_id), job.title, jobId);

    return job;
  }

  // ─── Customer: Approve completion ────────────────────────────────────────

  async approveCompletion(
    customerId: string,
    jobId: string,
    dto: ReviewJobDto,
  ): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.customer_id.toString() !== customerId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.COMPLETED);

    job.customer_rating = dto.rating;
    job.customer_review = dto.review;
    this.addEvent(job, JobStatus.COMPLETED, customerId, 'customer', 'Nghiệm thu hoàn thành');

    // Update contract
    await this.contractModel
      .findOneAndUpdate(
        { job_id: new Types.ObjectId(jobId) },
        { status: ContractStatus.COMPLETED, completed_at: new Date() },
      )
      .exec();

    await job.save();

    // ── Phase 8: Credit helper wallet ──────────────────────────────────────
    if (job.helper_id) {
      const contract = await this.contractModel
        .findOne({ job_id: new Types.ObjectId(jobId) })
        .exec();

      if (contract && contract.helper_receives > 0) {
        await this.paymentsService.creditHelper(
          String(job.helper_id),
          jobId,
          contract.helper_receives,
        );
      }
    }

    // Realtime
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

    // Notification: notify helper payment received
    if (job.helper_id) {
      await this.notificationsService.create({
        userId: String(job.helper_id),
        type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
        title: 'Thanh toán nhận được!',
        body: `Công việc "${job.title}" đã hoàn thành. Thu nhập đã được cộng vào ví.`,
        payload: { job_id: jobId },
      });
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

    if (actorRole === 'customer' && job.customer_id.toString() !== actorId) {
      throw new ForbiddenException();
    }
    if (actorRole === 'helper' && job.helper_id?.toString() !== actorId) {
      throw new ForbiddenException();
    }

    this.validateTransition(job.status, JobStatus.CANCELLED);
    job.cancellation_reason = dto.reason;
    job.cancelled_by = new Types.ObjectId(actorId);
    this.addEvent(job, JobStatus.CANCELLED, actorId, actorRole, `Hủy: ${dto.reason}`);

    // Reject all pending quotes
    await this.quoteModel
      .updateMany(
        { job_id: new Types.ObjectId(jobId), status: QuoteStatus.PENDING },
        { status: QuoteStatus.REJECTED },
      )
      .exec();

    await job.save();

    // Realtime
    this.emitJobStatusChange(job);
    this.gateway.emitToJob(jobId, SOCKET_EVENTS.JOB_CANCELLED, {
      job_id: jobId,
      cancelled_by: actorRole,
      reason: dto.reason,
    });

    // Notification: notify the other party
    if (actorRole === 'customer' && job.helper_id) {
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

  async getAvailableJobs(serviceId?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {
      status: { $in: [JobStatus.OPEN, JobStatus.RECEIVING_QUOTES] },
      expires_at: { $gt: new Date() },
    };
    if (serviceId && Types.ObjectId.isValid(serviceId)) {
      query['service_id'] = new Types.ObjectId(serviceId);
    }
    const skip = (page - 1) * limit;
    const [jobs, total] = await Promise.all([
      this.jobModel
        .find(query)
        .populate('service_id', 'name slug icon')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.jobModel.countDocuments(query).exec(),
    ]);
    return { jobs, total, page, limit, total_pages: Math.ceil(total / limit) };
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

  async getContract(jobId: string, requesterId: string): Promise<ContractDocument> {
    const contract = await this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();
    if (!contract) throw new NotFoundException('Hợp đồng không tồn tại');
    if (
      contract.customer_id.toString() !== requesterId &&
      contract.helper_id.toString() !== requesterId
    ) {
      throw new ForbiddenException();
    }
    return contract;
  }
}

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
  CreateQuoteDto,
  SelectQuoteDto,
  CompleteJobDto,
  ReviewJobDto,
  CancelJobDto,
} from './dto/job.dto';
import { JobStatus, QuoteStatus, ContractStatus, isValidJobTransition } from '@homemate/types';
import {
  JOB_OPEN_EXPIRY_HOURS,
  JOB_QUOTE_EXPIRY_HOURS,
  PLATFORM_FEE_BY_SERVICE,
} from '@homemate/constants';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(Quote.name) private quoteModel: Model<QuoteDocument>,
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
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

    return job;
  }

  // ─── Customer: Get own jobs ───────────────────────────────────────────────

  async getCustomerJobs(customerId: string, status?: string) {
    const query: Record<string, unknown> = { customer_id: new Types.ObjectId(customerId) };
    if (status) query['status'] = status;
    return this.jobModel.find(query).sort({ created_at: -1 }).exec();
  }

  // ─── Get single job ───────────────────────────────────────────────────────

  async getJobById(jobId: string): Promise<JobDocument> {
    const job = await this.jobModel
      .findById(jobId)
      .populate('service_id', 'name slug icon platform_fee_percent')
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

    return { job, contract };
  }

  // ─── Helper: Start navigation ─────────────────────────────────────────────

  async helperOnTheWay(helperId: string, jobId: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.HELPER_ON_THE_WAY);
    this.addEvent(job, JobStatus.HELPER_ON_THE_WAY, helperId, 'helper');
    return job.save();
  }

  // ─── Helper: Arrived ──────────────────────────────────────────────────────

  async helperArrived(helperId: string, jobId: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.HELPER_ARRIVED);
    this.addEvent(job, JobStatus.HELPER_ARRIVED, helperId, 'helper');
    return job.save();
  }

  // ─── Helper: Start job ────────────────────────────────────────────────────

  async startJob(helperId: string, jobId: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.helper_id?.toString() !== helperId) throw new ForbiddenException();
    this.validateTransition(job.status, JobStatus.IN_PROGRESS);
    this.addEvent(job, JobStatus.IN_PROGRESS, helperId, 'helper', 'Bắt đầu làm việc');
    return job.save();
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
    this.addEvent(job, JobStatus.PENDING_REVIEW, helperId, 'helper', 'Upload ảnh hoàn thành');
    return job.save();
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

    return job.save();
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

    return job.save();
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
    if (status) query['status'] = status;
    return this.jobModel.find(query).sort({ created_at: -1 }).exec();
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

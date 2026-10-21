import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InsuranceClaim,
  InsuranceClaimDocument,
  InsuranceClaimStatus,
} from './schemas/insurance-claim.schema';
import { CreateClaimDto, ReviewClaimDto } from './dto/claim.dto';
import { Job, JobDocument, Contract, ContractDocument } from '../jobs/schemas/job.schema';
import { JobStatus, UserRole } from '@homemate/types';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';

const OPEN_STATUSES: InsuranceClaimStatus[] = ['submitted', 'under_review'];

/**
 * Yêu cầu bồi thường bảo hiểm (Feature 10).
 *
 * Cửa sổ bảo hiểm tính như đơn bảo hành (Feature 9): từ lúc đơn hoàn thành
 * (contract.completed_at, fallback job.updated_at) cộng
 * contract.warranty_days (nếu > 0) hoặc mặc định 30 ngày.
 * Mỗi đơn chỉ được có 1 yêu cầu đang mở (submitted/under_review).
 * Admin duyệt → chi trả ngay vào ví khách qua refundCustomer → 'paid'.
 */
@Injectable()
export class ClaimsService {
  constructor(
    @InjectModel(InsuranceClaim.name)
    private claimModel: Model<InsuranceClaimDocument>,
    @InjectModel(Job.name)
    private jobModel: Model<JobDocument>,
    @InjectModel(Contract.name)
    private contractModel: Model<ContractDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ─── Customer ─────────────────────────────────────────────────────────────

  async createClaim(customerId: string, dto: CreateClaimDto) {
    if (!Types.ObjectId.isValid(dto.job_id)) {
      throw new BadRequestException('job_id không hợp lệ');
    }
    const job = await this.jobModel.findById(dto.job_id).exec();
    if (!job) throw new NotFoundException('Không tìm thấy đơn');
    if (job.customer_id.toString() !== customerId) {
      throw new ForbiddenException('Bạn chỉ có thể yêu cầu bồi thường cho đơn của mình');
    }
    if (job.status !== JobStatus.COMPLETED) {
      throw new BadRequestException(
        'Chỉ đơn đã hoàn thành mới được yêu cầu bồi thường bảo hiểm',
      );
    }

    // ── Cửa sổ bảo hiểm ──
    const contract = await this.contractModel
      .findOne({ job_id: new Types.ObjectId(dto.job_id) })
      .exec();
    const windowDays = contract && contract.warranty_days > 0 ? contract.warranty_days : 30;
    const completedAt = contract?.completed_at ?? job.updated_at;
    const deadline = new Date(completedAt).getTime() + windowDays * 24 * 3600 * 1000;
    if (Date.now() > deadline) {
      throw new BadRequestException(
        'Đã quá thời hạn yêu cầu bồi thường (30 ngày sau hoàn thành)',
      );
    }

    const open = await this.claimModel
      .findOne({
        job_id: new Types.ObjectId(dto.job_id),
        status: { $in: OPEN_STATUSES },
      })
      .exec();
    if (open) {
      throw new ConflictException(
        'Đơn này đã có yêu cầu bồi thường đang được xử lý, vui lòng chờ kết quả',
      );
    }

    const claim = await this.claimModel.create({
      job_id: new Types.ObjectId(dto.job_id),
      customer_id: new Types.ObjectId(customerId),
      helper_id: job.helper_id ? new Types.ObjectId(String(job.helper_id)) : undefined,
      description: dto.description,
      photos: dto.photos ?? [],
      requested_amount: dto.requested_amount,
      approved_amount: 0,
      status: 'submitted',
      timeline: [
        {
          status: 'submitted',
          note: 'Khách hàng đã gửi yêu cầu bồi thường',
          actor_id: new Types.ObjectId(customerId),
          actor_role: 'customer',
          at: new Date(),
        },
      ],
    });
    return claim;
  }

  async getMyClaims(customerId: string) {
    return this.claimModel
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ created_at: -1 })
      .populate('job_id', 'title status')
      .exec();
  }

  /** Yêu cầu bồi thường mới nhất của 1 đơn (hoặc null nếu chưa có). */
  async getClaimForJob(customerId: string, jobId: string) {
    if (!Types.ObjectId.isValid(jobId)) return null;
    const claim = await this.claimModel
      .findOne({
        job_id: new Types.ObjectId(jobId),
        customer_id: new Types.ObjectId(customerId),
      })
      .sort({ created_at: -1 })
      .exec();
    return claim ?? null;
  }

  async getClaim(id: string, user: { sub: string; roles?: string[] }) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Không tìm thấy yêu cầu');
    const claim = await this.claimModel
      .findById(id)
      .populate('job_id')
      .populate('customer_id', 'full_name avatar phone')
      .populate('helper_id', 'full_name avatar phone')
      .exec();
    if (!claim) throw new NotFoundException('Không tìm thấy yêu cầu');
    const isAdmin = (user.roles ?? []).includes(UserRole.ADMIN);
    const isCustomer = this.idOf(claim.customer_id as unknown as Types.ObjectId) === user.sub;
    const isHelper = claim.helper_id
      ? this.idOf(claim.helper_id as unknown as Types.ObjectId) === user.sub
      : false;
    if (!isAdmin && !isCustomer && !isHelper) {
      throw new ForbiddenException('Bạn không có quyền xem yêu cầu bồi thường này');
    }
    return claim;
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async adminList(status?: string, page = 1, limit = 20) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [claims, total] = await Promise.all([
      this.claimModel
        .find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('job_id', 'title status')
        .populate('customer_id', 'full_name avatar phone')
        .exec(),
      this.claimModel.countDocuments(filter).exec(),
    ]);
    return { claims, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  async adminGet(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Không tìm thấy yêu cầu');
    const claim = await this.claimModel
      .findById(id)
      .populate('job_id')
      .populate('customer_id', 'full_name avatar phone')
      .populate('helper_id', 'full_name avatar phone')
      .exec();
    if (!claim) throw new NotFoundException('Không tìm thấy yêu cầu');
    return claim;
  }

  async adminReview(adminId: string, id: string, dto: ReviewClaimDto) {
    const claim = await this.adminGet(id);

    const pushTimeline = (status: InsuranceClaimStatus, note?: string) => {
      claim.timeline.push({
        status,
        note,
        actor_id: new Types.ObjectId(adminId),
        actor_role: 'admin',
        at: new Date(),
      } as InsuranceClaimDocument['timeline'][number]);
    };

    if (dto.action === 'start_review') {
      if (claim.status !== 'submitted') {
        throw new ConflictException('Chỉ yêu cầu mới gửi mới bắt đầu xem xét được');
      }
      claim.status = 'under_review';
      pushTimeline('under_review', dto.note || 'Admin bắt đầu xem xét hồ sơ');
      await claim.save();
      await this.notifyCustomer(claim, '🛡 Yêu cầu bồi thường đang được xem xét', 'Đội ngũ Green House đang xem xét hồ sơ bồi thường của bạn.');
      return claim;
    }

    if (dto.action === 'reject') {
      if (!dto.note?.trim()) {
        throw new BadRequestException('Vui lòng nhập lý do từ chối bồi thường');
      }
      if (claim.status === 'paid' || claim.status === 'rejected') {
        throw new ConflictException('Yêu cầu này đã có kết quả cuối cùng');
      }
      claim.status = 'rejected';
      claim.reject_reason = dto.note.trim();
      pushTimeline('rejected', dto.note.trim());
      await claim.save();
      await this.notifyCustomer(
        claim,
        '❌ Yêu cầu bồi thường bị từ chối',
        `Lý do: ${dto.note.trim()}`,
      );
      return claim;
    }

    // approve → duyệt + chi trả ngay vào ví khách
    if (!dto.approved_amount || dto.approved_amount <= 0) {
      throw new BadRequestException('Số tiền duyệt bồi thường phải lớn hơn 0');
    }
    if (claim.status !== 'submitted' && claim.status !== 'under_review') {
      throw new ConflictException('Yêu cầu này đã có kết quả cuối cùng');
    }
    claim.approved_amount = dto.approved_amount;
    claim.status = 'approved';
    pushTimeline('approved', dto.note || `Duyệt bồi thường ${dto.approved_amount.toLocaleString('vi-VN')}₫`);
    await claim.save();

    const jobIdStr = this.idOf(claim.job_id as unknown as Types.ObjectId);
    const tx = await this.paymentsService.refundCustomer(
      this.idOf(claim.customer_id as unknown as Types.ObjectId),
      jobIdStr,
      dto.approved_amount,
      `Bồi thường bảo hiểm đơn #${jobIdStr.slice(-6)}`,
    );
    claim.status = 'paid';
    claim.payout_transaction_id = String(tx._id);
    pushTimeline('paid', `Đã cộng ${dto.approved_amount.toLocaleString('vi-VN')}₫ vào ví khách hàng`);
    await claim.save();

    await this.notifyCustomer(
      claim,
      '💰 Bồi thường bảo hiểm đã được chi trả',
      `Yêu cầu bồi thường cho đơn #${jobIdStr.slice(-6)} đã được duyệt: ${dto.approved_amount.toLocaleString('vi-VN')}₫ đã cộng vào ví của bạn.`,
    );
    return claim;
  }

  /** Lấy id dạng string từ field ObjectId — kể cả khi field đã được populate. */
  private idOf(field: Types.ObjectId | { _id: Types.ObjectId } | string): string {
    if (!field) return '';
    if (typeof field === 'string') return field;
    const asObj = field as { _id?: Types.ObjectId };
    return String(asObj._id ?? field);
  }

  private async notifyCustomer(claim: InsuranceClaimDocument, title: string, body: string) {
    const customerId = this.idOf(claim.customer_id as unknown as Types.ObjectId);
    await this.notificationsService.create({
      userId: customerId,
      type: 'insurance_claim_update',
      title,
      body,
      payload: { claim_id: String(claim._id), kind: 'insurance_claim' },
    });
  }
}

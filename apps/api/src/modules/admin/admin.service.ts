import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { Job, JobDocument, Contract, ContractDocument } from '../jobs/schemas/job.schema';
import { Quote, QuoteDocument } from '../jobs/schemas/job.schema';
import { Service, ServiceDocument } from '../services/schemas/service.schema';
import { Notification, NotificationDocument } from '../notifications/schemas/notification.schema';
import {
  Wallet,
  WalletDocument,
  Transaction,
  TransactionDocument,
  Withdrawal,
  WithdrawalDocument,
} from '../payments/schemas/payment.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import {
  CustomerProfile,
  CustomerProfileDocument,
} from '../customers/schemas/customer-profile.schema';
import {
  SosBackupRequest,
  SosBackupRequestDocument,
} from '../sos-backup/schemas/sos-backup.schema';
import {
  HelperPenaltyEvent,
  HelperPenaltyEventDocument,
} from '../helpers/schemas/helper-penalty-event.schema';
import {
  computeHelperScore,
  countCancellationsInWindow,
  helperScoreConfigFromEnv,
  helperScoreInputFromProfile,
  pruneCancellationTimestamps,
  HelperScoreResult,
} from '../helpers/utils/helper-score';
import { maskHelperBankAccount } from '../helpers/utils/mask-bank-account';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
import {
  ContractStatus,
  HelperStatus,
  JobStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
  VerificationStatus,
} from '@homemate/types';
import { NOTIFICATION_TYPES, PLATFORM_FEE_BY_SERVICE } from '@homemate/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import {
  JobsService,
  ACTIVE_HELPER_JOB_STATUSES,
  computeNetPaidAmount,
  toVnDateString,
} from '../jobs/jobs.service';

const ADMIN_JOB_STATUS_TRANSITIONS: Record<string, string[]> = {
  [JobStatus.DRAFT]: [JobStatus.OPEN, JobStatus.CANCELLED],
  [JobStatus.OPEN]: [
    JobStatus.RECEIVING_QUOTES,
    JobStatus.QUOTE_SELECTED,
    JobStatus.CONFIRMED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.RECEIVING_QUOTES]: [
    JobStatus.QUOTE_SELECTED,
    JobStatus.CONFIRMED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.QUOTE_SELECTED]: [
    JobStatus.CONFIRMED,
    JobStatus.RECEIVING_QUOTES,
    JobStatus.CANCELLED,
  ],
  [JobStatus.CONFIRMED]: [JobStatus.HELPER_ON_THE_WAY, JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.HELPER_ON_THE_WAY]: [
    JobStatus.HELPER_ARRIVED,
    JobStatus.IN_PROGRESS,
    JobStatus.CANCELLED,
  ],
  [JobStatus.HELPER_ARRIVED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [
    JobStatus.PENDING_REVIEW,
    JobStatus.COMPLETED,
    JobStatus.DISPUTED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.PENDING_REVIEW]: [
    JobStatus.COMPLETED,
    JobStatus.DISPUTED,
    JobStatus.IN_PROGRESS,
    JobStatus.CANCELLED,
  ],
  [JobStatus.DISPUTED]: [
    // P2-26: Cấm chuyển trực tiếp DISPUTED -> IN_PROGRESS, phải phân xử khiếu nại (completed/refunded/cancelled)
    JobStatus.COMPLETED,
    JobStatus.REFUNDED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: [JobStatus.REFUNDED],
  [JobStatus.REFUNDED]: [],
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HelperProfile.name) private helperModel: Model<HelperProfileDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(CustomerProfile.name) private customerModel: Model<CustomerProfileDocument>,
    @InjectModel(SosBackupRequest.name)
    private sosModel: Model<SosBackupRequestDocument>,
    @InjectModel(HelperPenaltyEvent.name)
    private penaltyEventModel: Model<HelperPenaltyEventDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
    @Inject(forwardRef(() => JobsService))
    private readonly jobsService: JobsService,
    @Optional()
    @InjectModel(Quote.name)
    private quoteModel?: Model<QuoteDocument>,
    @Optional()
    @InjectModel(Service.name)
    private serviceModel?: Model<ServiceDocument>,
  ) {}

  // ─── Users ────────────────────────────────────────────────────────────────

  // B108 & A08: lịch sử thông báo đã gửi (mới nhất trước) — nội dung, người nhận,
  // thời gian, đã đọc/chưa đọc. Hỗ trợ grouped=true để nhóm theo đợt broadcast.
  async getSentNotifications(
    page = 1,
    limit = 20,
    type?: string,
    userId?: string,
    grouped = false,
  ) {
    if (grouped) {
      const matchStage: Record<string, unknown> = {};
      if (type) matchStage['type'] = type;
      else matchStage['type'] = NOTIFICATION_TYPES.SYSTEM;
      if (userId) matchStage['user_id'] = new Types.ObjectId(userId);

      const pipeline: any[] = [
        { $match: matchStage },
        {
          $group: {
            _id: {
              $ifNull: [
                '$data.broadcast_batch_id',
                {
                  $concat: [
                    '$title',
                    '::',
                    { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$created_at' } },
                  ],
                },
              ],
            },
            title: { $first: '$title' },
            body: { $first: '$body' },
            type: { $first: '$type' },
            created_at: { $first: '$created_at' },
            recipient_count: { $sum: 1 },
          },
        },
        { $sort: { created_at: -1 } },
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          },
        },
      ];

      const aggResult = await this.notificationModel.aggregate(pipeline).exec();
      const total = aggResult[0]?.metadata[0]?.total || 0;
      const data = aggResult[0]?.data || [];

      return {
        notifications: data.map((d: any) => ({
          _id: String(d._id),
          title: d.title,
          body: d.body,
          type: d.type,
          recipient_count: d.recipient_count,
          created_at: d.created_at,
        })),
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      };
    }

    const query: Record<string, unknown> = {};
    if (type) query['type'] = type;
    if (userId) query['user_id'] = new Types.ObjectId(userId);
    const [rows, total] = await Promise.all([
      this.notificationModel
        .find(query)
        .populate('user_id', 'full_name phone email')
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.notificationModel.countDocuments(query).exec(),
    ]);
    return { notifications: rows, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  async getUsers(search?: string, status?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (status === 'deleted') {
      query['is_deleted'] = true;
    } else {
      query['is_deleted'] = false;
      if (status) query['status'] = status;
    }
    if (search?.trim()) {
      const safeSearch = escapeRegex(search.trim());
      query['$or'] = [
        { full_name: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-password_hash')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);
    return { users, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  async getUserById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select('-password_hash').exec();
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return user;
  }

  // Everything an admin needs to look into one account, whichever roles it has.
  async getUserDetail(id: string) {
    const user = await this.getUserById(id);
    const uid = user._id as Types.ObjectId;
    const jobFields = 'title status created_at address.district address.city is_sos';
    const [
      helperProfile,
      customerProfile,
      wallet,
      jobsAsCustomer,
      jobsAsHelper,
      jobCountsAsCustomer,
      jobCountsAsHelper,
      transactions,
      withdrawals,
      reviewsReceived,
      reviewsWritten,
      ratingAgg,
    ] = await Promise.all([
      this.helperModel.findOne({ user_id: uid }).populate('service_ids', 'name').exec(),
      this.customerModel.findOne({ user_id: uid }).exec(),
      this.walletModel.findOne({ user_id: uid }).exec(),
      this.jobModel
        .find({ customer_id: uid })
        .select(jobFields)
        .populate('helper_id', 'full_name phone')
        .populate('service_id', 'name')
        .sort({ created_at: -1 })
        .limit(20)
        .exec(),
      this.jobModel
        .find({ helper_id: uid })
        .select(jobFields)
        .populate('customer_id', 'full_name phone')
        .populate('service_id', 'name')
        .sort({ created_at: -1 })
        .limit(20)
        .exec(),
      this.jobModel.aggregate([
        { $match: { customer_id: uid } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      this.jobModel.aggregate([
        { $match: { helper_id: uid } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      this.transactionModel.find({ user_id: uid }).sort({ created_at: -1 }).limit(20).exec(),
      this.withdrawalModel.find({ user_id: uid }).sort({ created_at: -1 }).limit(10).exec(),
      this.reviewModel
        .find({ helper_id: uid })
        .populate('customer_id', 'full_name')
        .populate('job_id', 'title')
        .sort({ created_at: -1 })
        .limit(10)
        .exec(),
      this.reviewModel
        .find({ customer_id: uid })
        .populate('helper_id', 'full_name')
        .populate('job_id', 'title')
        .sort({ created_at: -1 })
        .limit(10)
        .exec(),
      // Computed live: the denormalised counters on older helper profiles were never maintained.
      this.reviewModel.aggregate([
        { $match: { helper_id: uid } },
        { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
      ]),
    ]);

    const toCounts = (rows: { _id: string; n: number }[]) =>
      Object.fromEntries(rows.map(r => [r._id, r.n])) as Record<string, number>;

    return {
      user,
      helper_profile: helperProfile,
      customer_profile: customerProfile,
      wallet,
      job_counts: {
        as_customer: toCounts(jobCountsAsCustomer),
        as_helper: toCounts(jobCountsAsHelper),
      },
      jobs_as_customer: jobsAsCustomer,
      jobs_as_helper: jobsAsHelper,
      transactions,
      withdrawals,
      reviews_received: reviewsReceived,
      reviews_written: reviewsWritten,
      rating_stats: {
        average: ratingAgg[0] ? Math.round(ratingAgg[0].avg * 10) / 10 : 0,
        total: ratingAgg[0]?.n ?? 0,
      },
    };
  }

  async suspendUser(id: string, reason?: string): Promise<UserDocument> {
    const target = await this.userModel.findById(id).select('roles').exec();
    if (!target) throw new NotFoundException('Người dùng không tồn tại');
    if (target.roles?.includes(UserRole.ADMIN)) {
      throw new BadRequestException('Không thể khóa tài khoản quản trị viên');
    }
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { status: UserStatus.SUSPENDED, suspension_reason: reason, suspended_at: new Date() },
        { new: true },
      )
      .exec();
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    // Every helper search (SOS broadcast, nearby, matching) only picks ONLINE helpers,
    // so taking the profile offline removes a suspended helper from all of them.
    await this.helperModel
      .updateOne({ user_id: user._id }, { status: HelperStatus.OFFLINE })
      .exec();
    return user;
  }

  async activateUser(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { status: UserStatus.ACTIVE, $unset: { suspension_reason: 1, suspended_at: 1 } },
        { new: true },
      )
      .exec();
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    // A13 & R5: Mở khóa tài khoản -> nếu là thợ và e-KYC đã duyệt thì đưa thợ về ONLINE
    if (user.roles?.includes(UserRole.HELPER)) {
      try {
        await this.helperModel
          .updateOne(
            { user_id: user._id, verification_status: VerificationStatus.APPROVED },
            { status: HelperStatus.ONLINE },
          )
          .exec();
      } catch (err) {
        this.logger.error(
          `activateUser: Failed to update helper status to ONLINE for user ${id}: ${(err as Error).message}`,
        );
        throw new InternalServerErrorException(
          `Mở khóa tài khoản người dùng thành công nhưng cập nhật trạng thái thợ thất bại: ${(err as Error).message}`,
        );
      }
    }

    return user;
  }

  // B107: xoá mềm — không xoá cứng, không xoá admin khác. Người đã xoá không
  // đăng nhập được (findByPhone/findByEmail lọc is_deleted: false). Hồ sơ thợ
  // (nếu có) cũng được đánh dấu deleted_at để không còn được đếm (B83).
  async deleteUser(id: string): Promise<UserDocument> {
    const target = await this.userModel.findById(id).select('roles is_deleted').exec();
    if (!target) throw new NotFoundException('Người dùng không tồn tại');
    if (target.roles?.includes(UserRole.ADMIN)) {
      throw new BadRequestException('Không thể xóa tài khoản quản trị viên');
    }
    if (target.is_deleted) throw new BadRequestException('Tài khoản đã bị xóa trước đó');
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { is_deleted: true, deleted_at: new Date(), status: UserStatus.SUSPENDED },
        { new: true },
      )
      .exec();
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    await this.helperModel
      .updateOne({ user_id: user._id }, { status: HelperStatus.OFFLINE, deleted_at: new Date() })
      .exec();
    return user;
  }

  // B107: khôi phục tài khoản đã xoá mềm.
  async restoreUser(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { is_deleted: false, status: UserStatus.ACTIVE, $unset: { deleted_at: 1 } },
        { new: true },
      )
      .exec();
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    await this.helperModel.updateOne({ user_id: user._id }, { $unset: { deleted_at: 1 } }).exec();
    return user;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async getHelpers(search?: string, verificationStatus?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (verificationStatus) query['verification_status'] = verificationStatus;

    // P2-17: Nếu tìm kiếm, query trước user_id để đếm total và phân trang chính xác
    if (search?.trim() && this.userModel?.find) {
      const safeSearch = escapeRegex(search.trim());
      const matchingUsers = await this.userModel
        .find({
          $or: [
            { full_name: { $regex: safeSearch, $options: 'i' } },
            { phone: { $regex: safeSearch, $options: 'i' } },
          ],
        })
        .select('_id')
        .lean()
        .exec();
      const userIds = (matchingUsers || []).map(u => u._id);
      query['user_id'] = { $in: userIds };
    }

    const skip = (page - 1) * limit;
    const [helpers, total] = await Promise.all([
      this.helperModel
        .find(query)
        .populate({
          path: 'user_id',
          select: 'full_name phone email avatar status',
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.helperModel.countDocuments(query).exec(),
    ]);

    const filtered = helpers.filter(h => h.user_id !== null);
    return {
      helpers: filtered.map(h => maskHelperBankAccount(h)),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  async getPendingKyc(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [helpers, total] = await Promise.all([
      this.helperModel
        .find({ verification_status: VerificationStatus.PENDING })
        .populate('user_id', 'full_name phone email avatar')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.helperModel.countDocuments({ verification_status: VerificationStatus.PENDING }).exec(),
    ]);
    // F3: che số TK ở danh sách chờ duyệt KYC (như getHelpers) — trang này
    // không dùng bank_account; chỉ che bank_account, giữ nguyên CCCD/ảnh.
    return {
      helpers: helpers.map(h => maskHelperBankAccount(h)),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  async approveKyc(userId: string): Promise<any> {
    const query = Types.ObjectId.isValid(userId)
      ? { $or: [{ user_id: new Types.ObjectId(userId) }, { _id: new Types.ObjectId(userId) }] }
      : { user_id: userId };
    const profile = await this.helperModel.findOne(query).exec();
    if (!profile) throw new NotFoundException('Helper profile not found');

    // A72: Kiểm tra trạng thái pending/rejected và đầy đủ giấy tờ e-KYC
    if (
      profile.verification_status !== VerificationStatus.PENDING &&
      profile.verification_status !== VerificationStatus.REJECTED
    ) {
      throw new BadRequestException('Hồ sơ không ở trạng thái chờ duyệt (PENDING)');
    }
    if (!profile.id_card_front || !profile.id_card_back || !profile.selfie_photo) {
      throw new BadRequestException(
        'Hồ sơ thiếu giấy tờ xác minh (CCCD mặt trước, mặt sau hoặc ảnh chân dung)',
      );
    }

    profile.verification_status = VerificationStatus.APPROVED;
    profile.verified_at = new Date();
    const saved = await profile.save();
    await this.notificationsService.create({
      userId: String(profile.user_id),
      type: NOTIFICATION_TYPES.KYC_APPROVED,
      title: 'Hồ sơ e-KYC đã được duyệt',
      body: 'Bạn đã có thể bật trạng thái sẵn sàng và gửi báo giá cho khách hàng.',
    });
    // G4 (F8): che số tài khoản như HelpersService — không trả số đầy đủ.
    return maskHelperBankAccount(saved);
  }

  async rejectKyc(userId: string, reason: string): Promise<any> {
    const query = Types.ObjectId.isValid(userId)
      ? { $or: [{ user_id: new Types.ObjectId(userId) }, { _id: new Types.ObjectId(userId) }] }
      : { user_id: userId };
    const profile = await this.helperModel.findOne(query).exec();
    if (!profile) throw new NotFoundException('Helper profile not found');
    // B82: chỉ từ chối được e-KYC đang chờ duyệt; đã duyệt/từ chối rồi → 400
    if (profile.verification_status !== VerificationStatus.PENDING) {
      throw new BadRequestException(
        'Hồ sơ không ở trạng thái chờ duyệt (PENDING), không thể từ chối',
      );
    }
    profile.verification_status = VerificationStatus.REJECTED;
    profile.rejection_reason = reason;
    // A helper who loses verification must stop receiving jobs and SOS broadcasts.
    if (profile.status === HelperStatus.ONLINE) profile.status = HelperStatus.OFFLINE;
    const saved = await profile.save();
    await this.notificationsService.create({
      userId: String(profile.user_id),
      type: NOTIFICATION_TYPES.KYC_REJECTED,
      title: 'Hồ sơ e-KYC bị từ chối',
      body: `Lý do: ${reason}. Vui lòng cập nhật và nộp lại hồ sơ.`,
      // B104: bấm thông báo mở đúng màn nộp lại e-KYC
      payload: { screen: 'kyc', route: '/kyc', reason },
    });
    // G4 (F8): che số tài khoản như HelpersService — không trả số đầy đủ.
    return maskHelperBankAccount(saved);
  }

  // ─── Jobs ─────────────────────────────────────────────────────────────────

  async getJobs(status?: string, search?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (status) query['status'] = status;
    if (search?.trim()) {
      const safeSearch = escapeRegex(search.trim());
      query['$or'] = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { 'address.city': { $regex: safeSearch, $options: 'i' } },
        { 'address.district': { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [jobs, total] = await Promise.all([
      this.jobModel
        .find(query)
        .populate('customer_id', 'full_name phone')
        .populate('helper_id', 'full_name phone')
        .populate('service_id', 'name')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.jobModel.countDocuments(query).exec(),
    ]);
    return { jobs, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  async getJobById(jobId: string): Promise<any> {
    const job = await this.jobModel
      .findById(jobId)
      .populate('customer_id', 'full_name phone')
      .populate('helper_id', 'full_name phone')
      .populate('service_id', 'name')
      .populate('private_offer_helper_id', 'full_name phone')
      .populate('rejected_helper_ids', 'full_name phone')
      .populate('selected_quote_id')
      .lean()
      .exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    // A02: Populate thêm danh sách báo giá và hợp đồng cho Admin xem thanh toán
    const [quotes, contract] = await Promise.all([
      this.quoteModel
        ? this.quoteModel
            .find({ job_id: new Types.ObjectId(jobId) })
            .populate('helper_id', 'full_name phone')
            .sort({ created_at: -1 })
            .lean()
            .exec()
        : Promise.resolve([]),
      this.contractModel
        .findOne({ job_id: new Types.ObjectId(jobId) })
        .lean()
        .exec(),
    ]);

    const netPaid = computeNetPaidAmount(job as any, contract?.total_price);
    const maxRefundable = Math.max(0, netPaid - ((job as any).refunded_amount || 0));

    return {
      ...job,
      quotes: quotes || [],
      contract: contract || null,
      net_paid: netPaid,
      max_refundable: maxRefundable,
    };
  }

  async updateJobStatus(
    jobId: string,
    status: string,
    note?: string,
    adminId?: string,
  ): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    const contract = await this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();

    // F3: Kiểm tra đơn đã hoàn thành và đã giải ngân chưa
    const isDisbursed = async (jobDoc: JobDocument): Promise<boolean> => {
      if (!jobDoc.helper_id || !contract) return true;
      if (jobDoc.payment_method === 'cash') {
        const commTx = await this.transactionModel
          .findOne({
            job_id: jobDoc._id,
            user_id: jobDoc.helper_id,
            type: 'commission',
            status: 'success',
          })
          .exec();
        return Boolean(commTx);
      } else {
        const earningTx = await this.transactionModel
          .findOne({
            job_id: jobDoc._id,
            user_id: jobDoc.helper_id,
            type: 'earning',
            status: 'success',
          })
          .exec();
        return Boolean(earningTx);
      }
    };

    if (job.status === status) {
      if (status === JobStatus.COMPLETED) {
        const disbursed = await isDisbursed(job);
        if (disbursed) {
          return job;
        }
        // Chưa giải ngân -> Tiếp tục xuống khối COMPLETED để retry giải ngân
      } else {
        return job;
      }
    }

    const currentStatus = String(job.status || '');
    if (job.status !== status) {
      const allowed = ADMIN_JOB_STATUS_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(status)) {
        throw new BadRequestException(
          `Không thể chuyển trạng thái từ "${currentStatus}" sang "${status}". Chuyển đổi trạng thái không hợp lệ.`,
        );
      }
    }

    // F2 & F3 & I4: Nhánh COMPLETED
    if (status === JobStatus.COMPLETED) {
      const isCash = job.payment_method === 'cash';
      const isWarranty = !!job.is_warranty;
      const origContractStatus = contract?.status;
      const origContractCompletedAt = contract?.completed_at;

      // F2 & I4: Kiểm tra tiền mặt & UNPAID TRƯỚC LẦN LƯU ĐẦU TIÊN
      if (job.helper_id) {
        if (isCash && !isWarranty) {
          const hasCashConfirmed = job.helper_cash_confirmed === true;
          let hasRecordedCashTx = false;
          if (typeof this.paymentsService?.hasRecordedCashPayment === 'function') {
            hasRecordedCashTx = await this.paymentsService.hasRecordedCashPayment(jobId);
          }
          if (!hasCashConfirmed && !hasRecordedCashTx) {
            throw new BadRequestException(
              'Thợ chưa xác nhận đã nhận tiền mặt từ khách. Không thể hoàn thành đơn tiền mặt.',
            );
          }
        } else if (!isWarranty && job.payment_status !== PaymentStatus.PAID) {
          throw new BadRequestException(
            'Đơn hàng chưa được thanh toán thành công, không thể chuyển sang hoàn thành',
          );
        }
        if (!contract) {
          throw new BadRequestException(
            'Đơn hàng có thợ phụ trách nhưng không có hợp đồng, không thể hoàn thành',
          );
        }
      }

      // F3: Atomic claim để chống 2 admin hoàn thành trùng
      let claimedJob: JobDocument | null = null;
      if (job.status !== JobStatus.COMPLETED) {
        const updateSet: any = {
          status: JobStatus.COMPLETED,
          completed_at: new Date(),
        };
        // F2: Đơn cash admin hoàn thành khi đã xác nhận nhận tiền thì set payment_status=PAID như luồng khách
        if (isCash && !isWarranty) {
          updateSet.payment_status = PaymentStatus.PAID;
        }

        claimedJob = await this.jobModel
          .findOneAndUpdate(
            { _id: job._id, status: job.status },
            {
              $set: updateSet,
              $push: {
                events: {
                  status: JobStatus.COMPLETED,
                  note: note || `Admin can thiệp thủ công: chuyển trạng thái sang ${status}`,
                  actor_id:
                    adminId && Types.ObjectId.isValid(adminId)
                      ? new Types.ObjectId(adminId)
                      : (job.customer_id as any) || new Types.ObjectId(),
                  actor_role: 'admin',
                  timestamp: new Date(),
                },
              },
            },
            { new: true },
          )
          .exec();

        if (!claimedJob) {
          throw new ConflictException('Công việc đã được cập nhật trạng thái bởi thao tác khác');
        }

        if (contract) {
          contract.status = ContractStatus.COMPLETED;
          contract.completed_at = new Date();
          await contract.save();
        }
      } else {
        claimedJob = job;
      }

      // F3: Giải ngân với rollback nếu giải ngân lỗi
      try {
        if (contract && claimedJob.helper_id) {
          if (isCash && !isWarranty) {
            await this.paymentsService?.deductCommissionForCashJob?.(
              String(claimedJob.helper_id),
              jobId,
              contract.platform_fee,
              contract.helper_receives,
            );
          } else if (isWarranty) {
            if (contract.helper_receives > 0) {
              await this.paymentsService?.creditHelper?.(
                String(claimedJob.helper_id),
                jobId,
                contract.helper_receives,
              );
            }
          } else if (claimedJob.payment_status === PaymentStatus.PAID) {
            const payout = contract.helper_receives;
            if (payout > 0) {
              const isSimulated =
                (await this.paymentsService?.hasSimulatedOnlinePayment?.(jobId)) ?? false;
              if (isSimulated) {
                await this.paymentsService?.creditHelperSimulated?.(
                  String(claimedJob.helper_id),
                  jobId,
                  payout,
                );
              } else {
                await this.paymentsService?.creditHelper?.(
                  String(claimedJob.helper_id),
                  jobId,
                  payout,
                );
              }
            }
          }
        }
      } catch (disburseErr: any) {
        this.logger.error(
          `F3: Giải ngân lỗi khi admin hoàn thành đơn ${jobId}: ${disburseErr?.message ?? disburseErr}`,
        );
        // Rollback nếu đơn vừa được claim sang COMPLETED (L1 & L2: dùng $unset nếu completed_at gốc là null/undefined)
        if (job.status !== JobStatus.COMPLETED) {
          const jobUpdate: Record<string, any> = {
            $set: {
              status: job.status,
              payment_status: job.payment_status,
            },
            $pull: {
              events: {
                note: note || `Admin can thiệp thủ công: chuyển trạng thái sang ${status}`,
              },
            },
          };
          if (job.completed_at != null) {
            jobUpdate.$set.completed_at = job.completed_at;
          } else {
            jobUpdate.$unset = { completed_at: '' };
          }

          await this.jobModel
            .updateOne({ _id: job._id }, jobUpdate)
            .exec()
            .catch(rErr => {
              this.logger.error(
                `Rollback trạng thái đơn ${jobId} thất bại: ${rErr?.message ?? rErr}`,
              );
            });
          if (contract && origContractStatus !== undefined) {
            const contractUpdate: Record<string, any> = {
              $set: { status: origContractStatus },
            };
            if (origContractCompletedAt != null) {
              contractUpdate.$set.completed_at = origContractCompletedAt;
            } else {
              contractUpdate.$unset = { completed_at: '' };
            }

            await this.contractModel
              .updateOne({ _id: contract._id }, contractUpdate)
              .exec()
              .catch(() => undefined);
            contract.status = origContractStatus;
            contract.completed_at = origContractCompletedAt;
          }
        }
        throw disburseErr;
      }

      if (claimedJob.helper_id) {
        await this.jobsService.setHelperBusy(claimedJob.helper_id, false);
      }
      this.jobsService.emitJobStatusChange(claimedJob);
      this.jobsService.emitJobCompleted(claimedJob);
      if (!claimedJob.review_reminder_sent) {
        const hasReviewed = await this.reviewModel.exists({ job_id: claimedJob._id });
        if (!hasReviewed) {
          await this.notificationsService
            .create({
              userId: String(claimedJob.customer_id),
              type: NOTIFICATION_TYPES.JOB_COMPLETED,
              title: '⭐ Đánh giá dịch vụ',
              body: `Công việc "${claimedJob.title}" đã hoàn thành. Hãy để lại đánh giá cho thợ nhé!`,
              payload: { job_id: String(claimedJob._id) },
            })
            .catch(() => undefined);
          await this.jobModel.updateOne({ _id: claimedJob._id }, { review_reminder_sent: true });
        }
      }
      return claimedJob;
    }

    // Các trạng thái khác (CANCELLED, REFUNDED, v.v.)
    job.status = status as any;
    if (status === JobStatus.CANCELLED) {
      if (adminId && Types.ObjectId.isValid(adminId)) {
        job.cancelled_by = new Types.ObjectId(adminId);
      }
      job.cancelled_by_role = 'admin';
    }
    job.events.push({
      status: status as any,
      note: note || `Admin can thiệp thủ công: chuyển trạng thái sang ${status}`,
      actor_id:
        adminId && Types.ObjectId.isValid(adminId)
          ? new Types.ObjectId(adminId)
          : (job.customer_id as any) || new Types.ObjectId(),
      actor_role: 'admin',
      timestamp: new Date(),
    });
    await job.save();

    if (contract) {
      if (status === JobStatus.CANCELLED || status === JobStatus.REFUNDED) {
        contract.status = ContractStatus.CANCELLED;
        await contract.save();
      }
    }

    if (status === JobStatus.CANCELLED || status === JobStatus.REFUNDED) {
      let refundDone = false;
      if (job.payment_status === PaymentStatus.PAID && job.payment_method !== 'cash') {
        const netPaid = computeNetPaidAmount(job, contract?.total_price);
        if (netPaid > 0) {
          let refundedSoFar = 0;
          if (typeof this.paymentsService?.getTotalRefundedForJob === 'function') {
            refundedSoFar = await this.paymentsService.getTotalRefundedForJob(jobId);
          } else if (typeof this.paymentsService?.hasSuccessfulRefund === 'function') {
            refundedSoFar = (await this.paymentsService.hasSuccessfulRefund(jobId)) ? netPaid : 0;
          }
          const remainingRefund = Math.max(0, netPaid - refundedSoFar);
          if (remainingRefund > 0) {
            await this.paymentsService?.refundCustomer?.(
              String(job.customer_id),
              jobId,
              remainingRefund,
              note || `Admin can thiệp chuyển trạng thái sang ${status}`,
            );
            refundedSoFar += remainingRefund;
          }
          if (refundedSoFar >= netPaid) {
            refundDone = true;
          }
        }
      }
      // R2 & N4: Chỉ đánh dấu REFUNDED nếu tiền thực tế đã được hoàn trả đủ, đơn UNPAID hoặc cash giữ nguyên
      if (refundDone) {
        job.payment_status = PaymentStatus.REFUNDED;
        await job.save();
      }
    }

    // Đồng bộ trạng thái bận của thợ khi chuyển sang trạng thái kết thúc (completed, refunded, cancelled)
    if (
      job.helper_id &&
      [JobStatus.COMPLETED, JobStatus.REFUNDED, JobStatus.CANCELLED].includes(status as JobStatus)
    ) {
      await this.jobsService.setHelperBusy(job.helper_id, false);
    }

    // Gửi tín hiệu realtime
    this.jobsService.emitJobStatusChange(job);
    if (status === JobStatus.COMPLETED) {
      this.jobsService.emitJobCompleted(job);
      // A81: Đơn do admin hoàn thành -> gửi nhắc đánh giá cho khách nếu chưa gửi và chưa đánh giá
      if (!job.review_reminder_sent) {
        const hasReviewed = await this.reviewModel.exists({ job_id: job._id });
        if (!hasReviewed) {
          job.review_reminder_sent = true;
          await job.save();
          await this.notificationsService
            .create({
              userId: String(job.customer_id),
              type: NOTIFICATION_TYPES.JOB_COMPLETED,
              title: 'Đánh giá dịch vụ',
              body: `Công việc "${job.title}" đã hoàn thành. Hãy chia sẻ đánh giá của bạn về chất lượng dịch vụ!`,
              payload: { job_id: String(job._id) },
            })
            .catch(() => undefined);
        }
      }
    } else if (status === JobStatus.CANCELLED) {
      // G5: Admin hủy đơn thì khôi phục voucher + điểm giống hệt cancelJob
      if (this.jobsService && typeof this.jobsService.restoreJobBenefitsOnCancel === 'function') {
        await this.jobsService.restoreJobBenefitsOnCancel(job).catch(err => {
          this.logger.error(
            `G5: Lỗi khôi phục voucher/điểm khi admin hủy đơn ${jobId}: ${err?.message ?? err}`,
          );
        });
      }
      this.jobsService.emitJobCancelled(job, note);
    }

    return job;
  }

  /**
   * Đồng bộ lại trạng thái bận cho toàn bộ thợ đang có status = BUSY:
   * Đếm số đơn đang hoạt động (confirmed, helper_on_the_way, helper_arrived, in_progress, pending_review).
   * Nếu không còn đơn nào (count === 0) -> chuyển về ONLINE.
   * Nếu còn đơn -> giữ nguyên BUSY.
   */
  async syncAllHelpersBusyStatus(): Promise<{
    total_checked: number;
    released_to_online: number;
    remained_busy: number;
    details: Array<{
      helper_id: string;
      user_id: string;
      full_name?: string;
      phone?: string;
      active_jobs_count: number;
      old_status: string;
      new_status: string;
    }>;
  }> {
    const busyHelpers = await this.helperModel
      .find({ status: HelperStatus.BUSY })
      .populate('user_id', 'full_name phone')
      .exec();

    let releasedCount = 0;
    let remainedCount = 0;
    const details: Array<{
      helper_id: string;
      user_id: string;
      full_name?: string;
      phone?: string;
      active_jobs_count: number;
      old_status: string;
      new_status: string;
    }> = [];

    for (const helper of busyHelpers) {
      const helperUserId = (helper.user_id as any)?._id || helper.user_id;
      const activeCount = await this.jobModel.countDocuments({
        helper_id: helperUserId,
        status: { $in: ACTIVE_HELPER_JOB_STATUSES },
      });

      if (activeCount === 0) {
        helper.status = HelperStatus.ONLINE;
        await helper.save();
        await this.jobsService.setHelperBusy(helperUserId, false);
        releasedCount++;
        details.push({
          helper_id: String(helper._id),
          user_id: String(helperUserId),
          full_name: (helper.user_id as any)?.full_name,
          phone: (helper.user_id as any)?.phone,
          active_jobs_count: 0,
          old_status: HelperStatus.BUSY,
          new_status: HelperStatus.ONLINE,
        });
      } else {
        remainedCount++;
        details.push({
          helper_id: String(helper._id),
          user_id: String(helperUserId),
          full_name: (helper.user_id as any)?.full_name,
          phone: (helper.user_id as any)?.phone,
          active_jobs_count: activeCount,
          old_status: HelperStatus.BUSY,
          new_status: HelperStatus.BUSY,
        });
      }
    }

    return {
      total_checked: busyHelpers.length,
      released_to_online: releasedCount,
      remained_busy: remainedCount,
      details,
    };
  }

  /**
   * Đồng bộ trạng thái bận cho 1 thợ cụ thể theo user_id:
   */
  async syncSingleHelperBusyStatus(userId: string) {
    const helper = await this.helperModel
      .findOne({ user_id: new Types.ObjectId(userId) })
      .populate('user_id', 'full_name phone')
      .exec();
    if (!helper) throw new NotFoundException('Hồ sơ thợ không tồn tại');

    const activeCount = await this.jobModel.countDocuments({
      helper_id: new Types.ObjectId(userId),
      status: { $in: ACTIVE_HELPER_JOB_STATUSES },
    });

    const oldStatus = helper.status;
    let newStatus = oldStatus;

    if (activeCount === 0 && helper.status === HelperStatus.BUSY) {
      helper.status = HelperStatus.ONLINE;
      await helper.save();
      await this.jobsService.setHelperBusy(userId, false);
      newStatus = HelperStatus.ONLINE;
    }

    return {
      helper_id: String(helper._id),
      user_id: userId,
      full_name: (helper.user_id as any)?.full_name,
      phone: (helper.user_id as any)?.phone,
      active_jobs_count: activeCount,
      old_status: oldStatus,
      new_status: newStatus,
    };
  }

  async directRefund(jobId: string, amount: number, reason: string, adminId?: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (!amount || amount <= 0) throw new BadRequestException('Số tiền hoàn phải lớn hơn 0');

    // A73: Chỉ hoàn tiền cho đơn đã thanh toán
    if (job.payment_status !== PaymentStatus.PAID) {
      throw new BadRequestException('Chỉ có thể hoàn tiền cho đơn đã thu tiền (PAID)');
    }

    const contract = await this.contractModel.findOne({ job_id: job._id }).exec();
    const netPaid = computeNetPaidAmount(job, contract?.total_price);

    // Tính tổng số tiền đã hoàn trước đó cho đơn này
    const previousRefunds = await this.transactionModel
      .find({
        job_id: job._id,
        type: 'refund',
        status: 'success',
      })
      .exec();
    const totalRefundedTxs = previousRefunds.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const currentRefunded = Math.max(job.refunded_amount || 0, totalRefundedTxs);
    const maxRefundable = Math.max(0, netPaid - currentRefunded);

    if (amount > maxRefundable) {
      throw new BadRequestException(
        `Số tiền hoàn (${amount.toLocaleString('vi-VN')}₫) vượt quá số tiền khách thực trả còn lại (tối đa có thể hoàn: ${maxRefundable.toLocaleString('vi-VN')}₫)`,
      );
    }

    // P0-2: Claim nguyên tử phần tiền hoàn trên job để chống 2 lần hoàn song song vượt netPaid
    if ((job.refunded_amount || 0) < totalRefundedTxs) {
      await this.jobModel
        .updateOne({ _id: job._id }, { $set: { refunded_amount: totalRefundedTxs } })
        .exec();
    }

    const updatedJob = await this.jobModel
      .findOneAndUpdate(
        {
          _id: job._id,
          $expr: {
            $lte: [{ $add: [{ $ifNull: ['$refunded_amount', 0] }, amount] }, netPaid],
          },
        },
        {
          $inc: { refunded_amount: amount },
        },
        { new: true },
      )
      .exec();

    if (!updatedJob) {
      throw new BadRequestException(
        `Không thể hoàn tiền: xung đột hoàn tiền song song hoặc số tiền hoàn vượt quá số tiền khách thực trả còn lại`,
      );
    }

    // P0-2: Gọi paymentsService.refundCustomer để xử lý hoàn tiền đúng bản chất nguồn tiền (simulated -> simulated_balance, real -> balance)
    let refundTx: any;
    try {
      refundTx = await this.paymentsService.refundCustomer(
        String(job.customer_id),
        jobId,
        amount,
        `Admin hoàn tiền trực tiếp cho đơn #${jobId.slice(-6)}: ${reason}`,
      );
    } catch (refundErr) {
      // Rollback claimed amount on failure
      await this.jobModel
        .updateOne({ _id: job._id }, { $inc: { refunded_amount: -amount } })
        .exec();
      throw refundErr;
    }

    // Ghi event vào đơn và cập nhật payment_status sang REFUNDED nếu đã hoàn 100%
    const isFullyRefunded = (updatedJob.refunded_amount || 0) >= netPaid;
    await this.jobModel
      .updateOne(
        { _id: job._id },
        {
          ...(isFullyRefunded ? { payment_status: PaymentStatus.REFUNDED } : {}),
          $push: {
            events: {
              status: job.status,
              note: `Admin hoàn tiền trực tiếp ${amount.toLocaleString('vi-VN')}₫ vào ví khách hàng. Lý do: ${reason}`,
              actor_id:
                adminId && Types.ObjectId.isValid(adminId)
                  ? new Types.ObjectId(adminId)
                  : (job.customer_id as any) || new Types.ObjectId(),
              actor_role: 'admin',
              timestamp: new Date(),
            },
          },
        },
      )
      .exec();

    await this.notificationsService
      .create({
        userId: String(job.customer_id),
        type: NOTIFICATION_TYPES.REFUND_RECEIVED,
        title: 'Hoàn tiền vào ví Green House',
        body: `Bạn đã nhận được khoản hoàn tiền ${amount.toLocaleString('vi-VN')}₫ cho đơn hàng #${jobId.slice(-6)}.`,
        payload: { job_id: jobId },
      })
      .catch(() => undefined);

    return {
      success: true,
      amount,
      job_id: jobId,
      balance_after: refundTx.balance_after,
      simulated: !!refundTx.metadata?.simulated,
    };
  }

  // ─── Broadcast notification ───────────────────────────────────────────────

  async broadcastNotification(
    title: string,
    body: string,
  ): Promise<{ sent: number; batch_id?: string }> {
    const users = await this.userModel
      .find({ is_deleted: false, status: { $ne: UserStatus.SUSPENDED } })
      .select('_id')
      .exec();
    const batchId = new Types.ObjectId().toString();
    return this.notificationsService.broadcastAll(
      users.map(u => u._id as Types.ObjectId),
      title,
      body,
      batchId,
    );
  }

  // B83: đếm thợ đang hoạt động — loại trừ hồ sơ đã xoá mềm (deleted_at != null)
  // và thợ có tài khoản user đã xoá (is_deleted).
  private async countActiveHelpers(): Promise<number> {
    const deletedUsers = await this.userModel
      .find({ is_deleted: true })
      .select('_id')
      .lean()
      .exec();
    const deletedIds = deletedUsers.map(u => u._id);
    return this.helperModel
      .countDocuments({
        deleted_at: null,
        ...(deletedIds.length ? { user_id: { $nin: deletedIds } } : {}),
      })
      .exec();
  }

  // ─── Dashboard stats ──────────────────────────────────────────────────────

  async getDashboardStats() {
    // T1: Tính startOfDay và startOfMonth theo múi giờ Việt Nam Asia/Ho_Chi_Minh (UTC+7)
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const vnDateStr = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, '0')}-${String(vnNow.getUTCDate()).padStart(2, '0')}`;
    const vnMonthStr = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const startOfDay = new Date(`${vnDateStr}T00:00:00+07:00`);
    const startOfMonth = new Date(`${vnMonthStr}T00:00:00+07:00`);

    const [
      totalUsers,
      totalHelpers,
      approvedHelpers,
      totalJobs,
      todayJobs,
      monthJobs,
      activeJobs,
      completedJobs,
      pendingJobs,
      disputedJobs,
      pendingKyc,
      pendingWithdrawals,
    ] = await Promise.all([
      this.userModel.countDocuments({ is_deleted: false }).exec(),
      // B83: tổng thợ loại trừ thợ đã xoá mềm (deleted_at != null hoặc user đã xoá)
      this.countActiveHelpers(),
      this.helperModel.countDocuments({ verification_status: VerificationStatus.APPROVED }).exec(),
      this.jobModel.countDocuments().exec(),
      this.jobModel.countDocuments({ created_at: { $gte: startOfDay } }).exec(),
      this.jobModel.countDocuments({ created_at: { $gte: startOfMonth } }).exec(),
      // B84: đơn đang hoạt động = chưa xong và chưa huỷ (loại trừ completed,
      // cancelled, expired, refunded — kể cả pending_review/disputed còn dở)
      this.jobModel
        .countDocuments({
          status: { $nin: ['completed', 'cancelled', 'expired', 'refunded'] },
        })
        .exec(),
      this.jobModel.countDocuments({ status: 'completed' }).exec(),
      this.jobModel.countDocuments({ status: { $in: ['open', 'receiving_quotes'] } }).exec(),
      this.jobModel.countDocuments({ status: 'disputed' }).exec(),
      this.helperModel.countDocuments({ verification_status: VerificationStatus.PENDING }).exec(),
      this.withdrawalModel.countDocuments({ status: 'pending' }).exec(),
    ]);

    const pendingActionsCount = pendingJobs + disputedJobs + pendingKyc + pendingWithdrawals;

    return {
      users: { total: totalUsers },
      helpers: { total: totalHelpers, approved: approvedHelpers, pending_kyc: pendingKyc },
      jobs: {
        total: totalJobs,
        today: todayJobs,
        this_month: monthJobs,
        active: activeJobs,
        completed: completedJobs,
        pending: pendingJobs,
        disputed: disputedJobs,
      },
      pending_actions_count: pendingActionsCount,
      pending_withdrawals: pendingWithdrawals,
    };
  }

  // ─── SOS Backup: giám sát & sổ phạt ───────────────────────────────────────

  /** Các yêu cầu SOS đã bị gắn cờ cần admin chú ý (admin_attention = true), mới nhất trước */
  async getFlaggedSosRequests(page = 1, limit = 20) {
    const query = { admin_attention: true };
    const skip = (page - 1) * limit;
    const [requests, total] = await Promise.all([
      this.sosModel
        .find(query)
        .populate('job_id', 'title status payment_status payment_method')
        .populate('customer_id', 'full_name phone')
        .populate('original_helper_id', 'full_name phone')
        .populate('replacement_helper_id', 'full_name phone')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.sosModel.countDocuments(query).exec(),
    ]);
    return { requests, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  /** Sổ sự kiện phạt hủy đơn của thợ (lọc theo helper_id / trạng thái nếu có), mới nhất trước */
  async getHelperPenaltyEvents(helperId?: string, status?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (helperId) {
      if (!Types.ObjectId.isValid(helperId)) {
        throw new BadRequestException('helper_id không hợp lệ');
      }
      query['helper_id'] = new Types.ObjectId(helperId);
    }
    if (status) query['status'] = status;
    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      this.penaltyEventModel
        .find(query)
        .populate('helper_id', 'full_name phone')
        .populate('job_id', 'title status')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.penaltyEventModel.countDocuments(query).exec(),
    ]);
    return { events, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  /**
   * Miễn 1 sự kiện phạt: sự kiện chuyển status 'waived' (kèm người duyệt, thời
   * điểm, lý do) và điểm thợ được tính lại KHÔNG còn sự kiện này.
   *
   * Cách điểm được tính (helper-score.ts): điểm phạt suy ra từ SỐ MỐC HỦY
   * trong HelperProfile.cancellation_timestamps ở cửa sổ trượt 7 ngày — mọi
   * nơi đọc điểm (snapshot trên hồ sơ, chi phí Hungarian của SOS Backup tính
   * trực tiếp từ cùng danh sách mốc này) đều suy ra từ đó. Vì vậy miễn phạt =
   * gỡ đúng 1 mốc hủy tương ứng khỏi danh sách (mốc gần nhất với thời điểm
   * ghi sự kiện — chính là lần hủy đã sinh ra sự kiện này) rồi tính lại
   * snapshot. Sự kiện đã waived thì không còn mốc nào bị gỡ thêm và không còn
   * được tính ở bất kỳ đường đọc nào — nhất quán theo cấu trúc dữ liệu.
   *
   * Idempotent: claim nguyên tử `status != 'waived'` — chỉ lần miễn đầu tiên
   * mới gỡ mốc + tính lại điểm; gọi lại trả về nguyên trạng (already_waived).
   * Số liệu lịch sử trên sự kiện (points_deducted…) KHÔNG bị sửa.
   */
  async waivePenaltyEvent(adminId: string, eventId: string, reason: string) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new BadRequestException('event_id không hợp lệ');
    }
    const now = new Date();
    const claimed = await this.penaltyEventModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(eventId), status: { $ne: 'waived' } },
        {
          $set: {
            status: 'waived',
            waived_by: new Types.ObjectId(adminId),
            waived_at: now,
            waive_reason: reason,
          },
        },
        { new: true },
      )
      .exec();

    if (!claimed) {
      const existing = await this.penaltyEventModel.findById(eventId).exec();
      if (!existing) throw new NotFoundException('Sự kiện phạt không tồn tại');
      return {
        event: existing,
        helper_score: await this.currentScoreSummary(String(existing.helper_id)),
        already_waived: true,
      };
    }

    const helperScore = await this.recomputeScoreAfterWaive(claimed, now);
    return { event: claimed, helper_score: helperScore, already_waived: false };
  }

  /** Tính lại điểm từ hồ sơ hiện tại (dùng cho đường đã-miễn: chỉ đọc, không sửa) */
  private async currentScoreSummary(helperId: string): Promise<HelperScoreResult | null> {
    const profile = await this.helperModel
      .findOne({ user_id: new Types.ObjectId(helperId) })
      .exec();
    if (!profile) return null;
    const config = helperScoreConfigFromEnv(key => process.env[key]);
    const now = new Date();
    return computeHelperScore(
      helperScoreInputFromProfile(
        profile,
        countCancellationsInWindow(profile.cancellation_timestamps ?? [], now, config.windowDays),
      ),
      config,
    );
  }

  /** Gỡ mốc hủy của sự kiện vừa miễn khỏi hồ sơ + tính lại snapshot điểm (giống record-cancellation.ts) */
  private async recomputeScoreAfterWaive(
    event: HelperPenaltyEventDocument,
    now: Date,
  ): Promise<HelperScoreResult | null> {
    const profile = await this.helperModel.findOne({ user_id: event.helper_id }).exec();
    if (!profile) return null;
    const config = helperScoreConfigFromEnv(key => process.env[key]);

    const stamps = [...(profile.cancellation_timestamps ?? [])];
    if (event.created_at) {
      // Mốc hủy sinh ra sự kiện nằm gần như trùng thời điểm ghi sự kiện
      // (recordHelperCancellation ghi mốc rồi mới tạo event). Chỉ gỡ khi tìm
      // thấy mốc đủ gần (≤ 5 phút) — sự kiện cũ đã rơi khỏi cửa sổ thì mốc
      // của nó cũng không còn được tính, không được gỡ nhầm mốc khác.
      const eventMs = new Date(event.created_at).getTime();
      let removeIdx = -1;
      let bestDelta = Number.POSITIVE_INFINITY;
      stamps.forEach((t, i) => {
        const delta = Math.abs(new Date(t).getTime() - eventMs);
        if (delta < bestDelta) {
          bestDelta = delta;
          removeIdx = i;
        }
      });
      if (removeIdx >= 0 && bestDelta <= 5 * 60 * 1000) stamps.splice(removeIdx, 1);
    }

    const pruned = pruneCancellationTimestamps(stamps, now, config.windowDays);
    const count = countCancellationsInWindow(pruned, now, config.windowDays);
    const result = computeHelperScore(helperScoreInputFromProfile(profile, count), config);

    profile.cancellation_timestamps = pruned;
    profile.cancellations_last_7_days = count;
    profile.penalty_points = result.penaltyPoints;
    profile.performance_score = result.total;
    profile.score_breakdown = result.breakdown;
    profile.score_updated_at = now;
    await profile.save();
    return result;
  }

  /** A09: Admin xử lý và gỡ cờ yêu cầu SOS cần chú ý */
  async resolveFlaggedSos(sosId: string, adminNote?: string, adminId?: string) {
    const sos = await this.sosModel.findById(sosId).exec();
    if (!sos) throw new NotFoundException('Yêu cầu SOS không tồn tại');
    sos.admin_attention = false;
    sos.admin_note = adminNote
      ? `${sos.admin_note ? sos.admin_note + ' | ' : ''}Đã xử lý bởi admin ${adminId ?? ''}: ${adminNote}`
      : `${sos.admin_note ? sos.admin_note + ' | ' : ''}Đã đánh dấu xử lý bởi admin ${adminId ?? ''}`;
    await sos.save();
    return { success: true, message: 'Đã đánh dấu xử lý thành công', sos };
  }

  /** B11: Admin gán thợ thủ công qua Hungarian matching */
  async adminAssignHelper(jobId: string, helperId: string, adminId?: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Đơn hàng không tồn tại');
    if (job.status !== JobStatus.OPEN && job.status !== JobStatus.RECEIVING_QUOTES) {
      throw new BadRequestException(
        'Chỉ có thể gán thợ cho đơn hàng đang chờ thợ (OPEN hoặc RECEIVING_QUOTES)',
      );
    }
    if (job.expires_at && new Date() > new Date(job.expires_at)) {
      throw new BadRequestException('Đơn hàng đã hết hạn nhận việc');
    }

    const helperProfile = await this.helperModel
      .findOne({ user_id: new Types.ObjectId(helperId) })
      .populate('user_id', 'full_name phone status is_verified')
      .exec();
    if (!helperProfile || helperProfile.verification_status !== VerificationStatus.APPROVED) {
      throw new BadRequestException('Thợ chưa hoàn tất xác thực e-KYC');
    }
    const helperUser = helperProfile.user_id as any;
    if (helperUser?.is_verified === false) {
      throw new BadRequestException('Tài khoản thợ chưa được xác minh qua email');
    }
    if (helperUser?.status === UserStatus.SUSPENDED || helperUser?.status === UserStatus.INACTIVE) {
      throw new BadRequestException('Tài khoản thợ đang bị tạm khóa hoặc ngừng hoạt động');
    }
    if (helperProfile.status === HelperStatus.OFFLINE) {
      throw new BadRequestException('Thợ đang ngoại tuyến, không thể gán đơn');
    }
    if (helperProfile.status === HelperStatus.BUSY) {
      throw new BadRequestException('Thợ đang bận làm việc cho đơn khác');
    }

    // Kiểm tra trùng lịch hẹn của thợ
    await this.jobsService.checkHelperScheduleConflict(
      helperId,
      job.preferred_date,
      job.preferred_time_start,
      jobId,
      job.preferred_time_end,
      job.estimated_duration,
    );

    // F4 & R-B11: Kiểm tra giá đơn TRƯỚC atomic claim — cấm claim trước rồi mới check giá làm kẹt đơn
    const agreedPrice = job.is_fixed_price ? job.fixed_price : job.target_price;
    if (!agreedPrice || agreedPrice <= 0) {
      throw new BadRequestException(
        'Đơn chưa có giá chốt hoặc giá dự kiến hợp lệ, không thể gán thợ',
      );
    }

    // F4: Đơn sau khi gán ở trạng thái chờ thanh toán (QUOTE_SELECTED) nếu chưa trả, chỉ CONFIRMED khi đã PAID
    const isPaid = job.payment_status === PaymentStatus.PAID;
    const targetStatus = isPaid ? JobStatus.CONFIRMED : JobStatus.QUOTE_SELECTED;

    // Claim nguyên tử
    const claimed = await this.jobModel
      .findOneAndUpdate(
        { _id: job._id, status: job.status, helper_id: null },
        {
          $set: {
            helper_id: new Types.ObjectId(helperId),
            status: targetStatus,
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) {
      throw new ConflictException('Đơn hàng đã được nhận hoặc gán bởi thao tác khác');
    }

    const totalPrice = agreedPrice;
    let platformFeeRate: number = PLATFORM_FEE_BY_SERVICE.default;
    if (job.service_id && this.serviceModel) {
      const service = await this.serviceModel
        .findById(job.service_id)
        .select('platform_fee_percent')
        .lean()
        .exec();
      if (typeof service?.platform_fee_percent === 'number') {
        platformFeeRate = service.platform_fee_percent / 100;
      }
    }
    const platformFee = Math.round(totalPrice * platformFeeRate);
    const helperReceives = totalPrice - platformFee;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // R-B11 & P2-4: Dựng scheduled_at từ preferred_date + preferred_time_start theo múi giờ VN (+07:00)
    let scheduledAt: Date;
    if (job.preferred_date) {
      const datePart = toVnDateString(job.preferred_date);
      const timePart = job.preferred_time_start ? `${job.preferred_time_start}:00` : '08:00:00';
      scheduledAt = new Date(`${datePart}T${timePart}+07:00`);
    } else {
      scheduledAt = tomorrow;
    }

    let contract: ContractDocument;
    try {
      contract = await this.contractModel.create({
        job_id: new Types.ObjectId(jobId),
        customer_id: job.customer_id,
        helper_id: new Types.ObjectId(helperId),
        labor_cost: totalPrice,
        materials_cost: 0,
        total_price: totalPrice,
        platform_fee: platformFee,
        helper_receives: helperReceives,
        warranty_days: 30,
        scheduled_at: scheduledAt,
      });
    } catch (contractErr) {
      await this.jobModel
        .updateOne({ _id: job._id }, { $set: { helper_id: null, status: job.status } })
        .exec()
        .catch(() => undefined);
      throw contractErr;
    }

    claimed.events.push({
      status: targetStatus,
      note: `Admin gán thợ thủ công ${helperUser?.full_name ?? helperId} qua kết quả ghép Hungarian (Admin ID: ${adminId ?? 'hệ thống'})`,
      actor_id:
        adminId && Types.ObjectId.isValid(adminId)
          ? new Types.ObjectId(adminId)
          : (job.customer_id as any),
      actor_role: 'admin',
      timestamp: new Date(),
    });
    await claimed.save();

    await this.jobsService.setHelperBusy(helperId, true);

    await this.notificationsService
      .create({
        userId: helperId,
        type: NOTIFICATION_TYPES.QUOTE_ACCEPTED,
        title: 'Bạn được gán công việc mới',
        body: `Quản trị viên đã chỉ định bạn thực hiện công việc "${job.title}". Vui lòng kiểm tra lịch làm việc!`,
        payload: { job_id: jobId, contract_id: String(contract._id) },
      })
      .catch(() => undefined);

    await this.notificationsService
      .create({
        userId: String(job.customer_id),
        type: NOTIFICATION_TYPES.JOB_CONFIRMED,
        title: 'Đơn hàng đã có thợ phụ trách',
        body:
          targetStatus === JobStatus.QUOTE_SELECTED
            ? `Thợ ${helperUser?.full_name ?? ''} đã được chỉ định phụ trách công việc "${job.title}". Vui lòng thanh toán để xác nhận đơn hàng.`
            : `Thợ ${helperUser?.full_name ?? ''} đã được chỉ định phụ trách công việc "${job.title}".`,
        payload: { job_id: jobId, helper_id: helperId },
      })
      .catch(() => undefined);

    this.jobsService.emitJobStatusChange(claimed);
    return claimed;
  }

  /**
   * I3: Sửa đơn kẹt đã có helper_id nhưng không có hợp đồng (CONFIRMED/QUOTE_SELECTED).
   * - mode = 'unassign' (mặc định): Hủy gán về OPEN (helper_id = null), trả trạng thái thợ về rảnh để gán lại được.
   * - mode = 'backfill': Tạo hợp đồng bù cho đơn dựa trên giá chốt/giá dự kiến.
   */
  async repairStuckAssignedJob(
    jobId: string,
    mode: 'unassign' | 'backfill' = 'unassign',
    adminId?: string,
  ): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Đơn hàng không tồn tại');

    // L3(b): Kiểm tra mode hợp lệ, từ chối mode không hợp lệ thay vì lặng lẽ fallback
    if (mode !== 'unassign' && mode !== 'backfill') {
      throw new BadRequestException(
        `Chế độ sửa "${mode}" không hợp lệ. Chỉ chấp nhận "unassign" hoặc "backfill".`,
      );
    }

    // L3(a): Chỉ cho sửa đơn ở CONFIRMED hoặc QUOTE_SELECTED (chặn unassign đơn đang làm dở)
    const allowedStatuses = [JobStatus.CONFIRMED, JobStatus.QUOTE_SELECTED];
    if (!allowedStatuses.includes(job.status as JobStatus)) {
      throw new BadRequestException(
        `Không thể sửa đơn ở trạng thái "${job.status}". Chỉ cho phép sửa đơn kẹt ở trạng thái CONFIRMED hoặc QUOTE_SELECTED.`,
      );
    }

    const existingContract = await this.contractModel.findOne({ job_id: job._id }).exec();
    if (existingContract) {
      throw new BadRequestException(
        'Đơn hàng đã có hợp đồng, không thuộc diện đơn kẹt thiếu hợp đồng',
      );
    }

    if (!job.helper_id) {
      throw new BadRequestException('Đơn hàng chưa có thợ gán, không thuộc diện đơn kẹt');
    }

    if (mode === 'backfill') {
      const agreedPrice = job.is_fixed_price ? job.fixed_price : job.target_price;
      if (!agreedPrice || agreedPrice <= 0) {
        throw new BadRequestException(
          'Đơn chưa có giá chốt hoặc giá dự kiến hợp lệ để tạo hợp đồng bù',
        );
      }
      let platformFeeRate: number = PLATFORM_FEE_BY_SERVICE.default;
      if (job.service_id && this.serviceModel) {
        const service = await this.serviceModel
          .findById(job.service_id)
          .select('platform_fee_percent')
          .lean()
          .exec();
        if (typeof service?.platform_fee_percent === 'number') {
          platformFeeRate = service.platform_fee_percent / 100;
        }
      }
      const platformFee = Math.round(agreedPrice * platformFeeRate);
      const helperReceives = agreedPrice - platformFee;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      let scheduledAt: Date = tomorrow;
      if (job.preferred_date) {
        const datePart = toVnDateString(job.preferred_date);
        const timePart = job.preferred_time_start ? `${job.preferred_time_start}:00` : '08:00:00';
        scheduledAt = new Date(`${datePart}T${timePart}+07:00`);
      }

      await this.contractModel.create({
        job_id: job._id,
        customer_id: job.customer_id,
        helper_id: job.helper_id,
        labor_cost: agreedPrice,
        materials_cost: 0,
        total_price: agreedPrice,
        platform_fee: platformFee,
        helper_receives: helperReceives,
        warranty_days: 30,
        scheduled_at: scheduledAt,
      });

      job.events.push({
        status: job.status,
        note: `Admin bù hợp đồng cho đơn kẹt (Admin ID: ${adminId ?? 'hệ thống'})`,
        actor_id:
          adminId && Types.ObjectId.isValid(adminId)
            ? new Types.ObjectId(adminId)
            : (job.customer_id as any),
        actor_role: 'admin',
        timestamp: new Date(),
      });
      await job.save();
      return job;
    }

    // Default mode: unassign -> OPEN, helper_id = null
    const prevHelperId = String(job.helper_id);
    job.helper_id = null as any;
    job.status = JobStatus.OPEN;
    job.events.push({
      status: JobStatus.OPEN,
      note: `Admin hủy gán thợ do đơn kẹt không có hợp đồng (Admin ID: ${adminId ?? 'hệ thống'})`,
      actor_id:
        adminId && Types.ObjectId.isValid(adminId)
          ? new Types.ObjectId(adminId)
          : (job.customer_id as any),
      actor_role: 'admin',
      timestamp: new Date(),
    });
    await job.save();

    await this.jobsService.setHelperBusy(prevHelperId, false);
    this.jobsService.emitJobStatusChange(job);
    return job;
  }
}

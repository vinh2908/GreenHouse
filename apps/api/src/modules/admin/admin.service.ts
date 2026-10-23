import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
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
  computePerformanceScore,
  countCancellationsInWindow,
  helperScoreConfigFromEnv,
  pruneCancellationTimestamps,
  HelperScoreResult,
} from '../helpers/utils/helper-score';
import { HelperStatus, UserRole, UserStatus, VerificationStatus } from '@homemate/types';
import { NOTIFICATION_TYPES } from '@homemate/constants';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HelperProfile.name) private helperModel: Model<HelperProfileDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
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
  ) {}

  // ─── Users ────────────────────────────────────────────────────────────────

  async getUsers(search?: string, status?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = { is_deleted: false };
    if (status) query['status'] = status;
    if (search) {
      query['$or'] = [
        { full_name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
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
    return user;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async getHelpers(search?: string, verificationStatus?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (verificationStatus) query['verification_status'] = verificationStatus;

    // If searching, join with users collection
    const skip = (page - 1) * limit;
    const [helpers, total] = await Promise.all([
      this.helperModel
        .find(query)
        .populate({
          path: 'user_id',
          select: 'full_name phone email avatar status',
          match: search
            ? {
                $or: [
                  { full_name: { $regex: search, $options: 'i' } },
                  { phone: { $regex: search, $options: 'i' } },
                ],
              }
            : undefined,
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.helperModel.countDocuments(query).exec(),
    ]);

    const filtered = search ? helpers.filter(h => h.user_id !== null) : helpers;
    return { helpers: filtered, total, page, limit, total_pages: Math.ceil(total / limit) };
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
    return { helpers, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  async approveKyc(userId: string): Promise<HelperProfileDocument> {
    const query = Types.ObjectId.isValid(userId)
      ? { $or: [{ user_id: new Types.ObjectId(userId) }, { _id: new Types.ObjectId(userId) }] }
      : { user_id: userId };
    const profile = await this.helperModel.findOne(query).exec();
    if (!profile) throw new NotFoundException('Helper profile not found');
    profile.verification_status = VerificationStatus.APPROVED;
    profile.verified_at = new Date();
    const saved = await profile.save();
    await this.notificationsService.create({
      userId: String(profile.user_id),
      type: NOTIFICATION_TYPES.KYC_APPROVED,
      title: 'Hồ sơ e-KYC đã được duyệt',
      body: 'Bạn đã có thể bật trạng thái sẵn sàng và gửi báo giá cho khách hàng.',
    });
    return saved;
  }

  async rejectKyc(userId: string, reason: string): Promise<HelperProfileDocument> {
    const query = Types.ObjectId.isValid(userId)
      ? { $or: [{ user_id: new Types.ObjectId(userId) }, { _id: new Types.ObjectId(userId) }] }
      : { user_id: userId };
    const profile = await this.helperModel.findOne(query).exec();
    if (!profile) throw new NotFoundException('Helper profile not found');
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
    });
    return saved;
  }

  // ─── Jobs ─────────────────────────────────────────────────────────────────

  async getJobs(status?: string, search?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (status) query['status'] = status;
    if (search) {
      query['$or'] = [
        { title: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { 'address.district': { $regex: search, $options: 'i' } },
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

  async getJobById(jobId: string): Promise<JobDocument> {
    const job = await this.jobModel
      .findById(jobId)
      .populate('customer_id', 'full_name phone')
      .populate('helper_id', 'full_name phone')
      .populate('service_id', 'name')
      .exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    return job;
  }

  async updateJobStatus(jobId: string, status: string, note?: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    job.status = status as any;
    job.events.push({
      status: status as any,
      note: note || `Admin can thiệp thủ công: chuyển trạng thái sang ${status}`,
      actor_id: new Types.ObjectId(),
      actor_role: 'admin',
      timestamp: new Date(),
    });
    await job.save();
    return job;
  }

  async directRefund(jobId: string, amount: number, reason: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (!amount || amount <= 0) throw new BadRequestException('Số tiền hoàn phải lớn hơn 0');

    let wallet = await this.walletModel.findOne({ user_id: job.customer_id }).exec();
    if (!wallet) {
      wallet = await this.walletModel.create({
        user_id: job.customer_id,
        balance: 0,
      });
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;
    wallet.balance = balanceAfter;
    await wallet.save();

    await this.transactionModel.create({
      wallet_id: wallet._id,
      user_id: job.customer_id,
      job_id: job._id,
      type: 'refund',
      status: 'success',
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Admin hoàn tiền trực tiếp cho đơn #${jobId.slice(-6)}: ${reason}`,
    });

    job.events.push({
      status: job.status,
      note: `Admin hoàn tiền trực tiếp ${amount.toLocaleString('vi-VN')}₫ vào ví khách hàng. Lý do: ${reason}`,
      actor_id: new Types.ObjectId(),
      actor_role: 'admin',
      timestamp: new Date(),
    });
    await job.save();

    await this.notificationsService
      .create({
        userId: String(job.customer_id),
        type: NOTIFICATION_TYPES.SYSTEM,
        title: 'Hoàn tiền vào ví Green House',
        body: `Bạn đã nhận được khoản hoàn tiền ${amount.toLocaleString('vi-VN')}₫ cho đơn hàng #${jobId.slice(-6)}.`,
        payload: { job_id: jobId },
      })
      .catch(() => undefined);

    return { success: true, amount, job_id: jobId, balance_after: balanceAfter };
  }

  // ─── Broadcast notification ───────────────────────────────────────────────

  async broadcastNotification(title: string, body: string): Promise<{ sent: number }> {
    const users = await this.userModel
      .find({ is_deleted: false, status: { $ne: UserStatus.SUSPENDED } })
      .select('_id')
      .exec();
    return this.notificationsService.broadcastAll(
      users.map(u => u._id as Types.ObjectId),
      title,
      body,
    );
  }

  // ─── Dashboard stats ──────────────────────────────────────────────────────

  async getDashboardStats() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      totalHelpers,
      approvedHelpers,
      totalJobs,
      todayJobs,
      monthJobs,
      activeJobs,
      completedJobs,
    ] = await Promise.all([
      this.userModel.countDocuments({ is_deleted: false }).exec(),
      this.helperModel.countDocuments().exec(),
      this.helperModel.countDocuments({ verification_status: VerificationStatus.APPROVED }).exec(),
      this.jobModel.countDocuments().exec(),
      this.jobModel.countDocuments({ created_at: { $gte: startOfDay } }).exec(),
      this.jobModel.countDocuments({ created_at: { $gte: startOfMonth } }).exec(),
      this.jobModel
        .countDocuments({
          status: { $in: ['confirmed', 'helper_on_the_way', 'helper_arrived', 'in_progress'] },
        })
        .exec(),
      this.jobModel.countDocuments({ status: 'completed' }).exec(),
    ]);

    return {
      users: { total: totalUsers },
      helpers: { total: totalHelpers, approved: approvedHelpers },
      jobs: {
        total: totalJobs,
        today: todayJobs,
        this_month: monthJobs,
        active: activeJobs,
        completed: completedJobs,
      },
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
    return computePerformanceScore(
      {
        rating: profile.rating,
        totalReviews: profile.total_reviews,
        completionRate: profile.completion_rate,
        acceptanceRate: profile.acceptance_rate,
        cancellationsInWindow: countCancellationsInWindow(
          profile.cancellation_timestamps ?? [],
          now,
          config.windowDays,
        ),
      },
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
    const result = computePerformanceScore(
      {
        rating: profile.rating,
        totalReviews: profile.total_reviews,
        completionRate: profile.completion_rate,
        acceptanceRate: profile.acceptance_rate,
        cancellationsInWindow: count,
      },
      config,
    );

    profile.cancellation_timestamps = pruned;
    profile.cancellations_last_7_days = count;
    profile.penalty_points = result.penaltyPoints;
    profile.performance_score = result.total;
    profile.score_breakdown = result.breakdown;
    profile.score_updated_at = now;
    await profile.save();
    return result;
  }
}

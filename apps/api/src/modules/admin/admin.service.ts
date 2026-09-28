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
import { UserRole, UserStatus, VerificationStatus } from '@homemate/types';
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
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { Notification, NotificationDocument } from '../notifications/schemas/notification.schema';
import { UserStatus, VerificationStatus } from '@homemate/types';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HelperProfile.name) private helperModel: Model<HelperProfileDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
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
    if (!user) throw new Error('User not found');
    return user;
  }

  async suspendUser(id: string, reason?: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { status: UserStatus.SUSPENDED }, { new: true })
      .exec();
    if (!user) throw new Error('User not found');
    return user;
  }

  async activateUser(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { status: UserStatus.ACTIVE }, { new: true })
      .exec();
    if (!user) throw new Error('User not found');
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
    const profile = await this.helperModel.findOne({ user_id: userId }).exec();
    if (!profile) throw new Error('Helper not found');
    profile.verification_status = VerificationStatus.APPROVED;
    profile.verified_at = new Date();
    return profile.save();
  }

  async rejectKyc(userId: string, reason: string): Promise<HelperProfileDocument> {
    const profile = await this.helperModel.findOne({ user_id: userId }).exec();
    if (!profile) throw new Error('Helper not found');
    profile.verification_status = VerificationStatus.REJECTED;
    profile.rejection_reason = reason;
    return profile.save();
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
    if (!job) throw new Error('Job not found');
    return job;
  }

  // ─── Broadcast notification ───────────────────────────────────────────────

  async broadcastNotification(title: string, body: string): Promise<{ sent: number }> {
    const users = await this.userModel.find({ is_deleted: false }).select('_id').exec();
    const notifications = users.map(u => ({
      user_id: u._id,
      type: 'system',
      title,
      body,
      is_read: false,
    }));
    await this.notificationModel.insertMany(notifications);
    return { sent: users.length };
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

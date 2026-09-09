import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Transaction, TransactionDocument } from '../payments/schemas/payment.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
  ) {}

  // ─── Jobs per day (last N days) ────────────────────────────────────────────

  async getJobsPerDay(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.jobModel
      .aggregate([
        { $match: { created_at: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ])
      .exec();
  }

  // ─── Jobs by status breakdown ──────────────────────────────────────────────

  async getJobsByStatus() {
    return this.jobModel
      .aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
        { $project: { status: '$_id', count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ])
      .exec();
  }

  // ─── Revenue per month (last 6 months) ────────────────────────────────────

  async getRevenuePerMonth(months = 6) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    return this.transactionModel
      .aggregate([
        {
          $match: {
            type: 'payment',
            status: 'success',
            created_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m', date: '$created_at' },
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { month: '$_id', total: 1, count: 1, _id: 0 } },
      ])
      .exec();
  }

  // ─── New users per day ─────────────────────────────────────────────────────

  async getNewUsersPerDay(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.userModel
      .aggregate([
        { $match: { created_at: { $gte: since }, is_deleted: false } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ])
      .exec();
  }

  // ─── Top helpers by completed jobs ────────────────────────────────────────

  async getTopHelpers(limit = 10) {
    return this.jobModel
      .aggregate([
        { $match: { status: 'completed', helper_id: { $exists: true } } },
        {
          $group: {
            _id: '$helper_id',
            completed_jobs: { $sum: 1 },
          },
        },
        { $sort: { completed_jobs: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $project: {
            helper_id: '$_id',
            completed_jobs: 1,
            full_name: { $arrayElemAt: ['$user.full_name', 0] },
            phone: { $arrayElemAt: ['$user.phone', 0] },
            _id: 0,
          },
        },
      ])
      .exec();
  }

  // ─── Average rating per service ────────────────────────────────────────────

  async getRatingByService() {
    return this.reviewModel
      .aggregate([
        {
          $lookup: {
            from: 'jobs',
            localField: 'job_id',
            foreignField: '_id',
            as: 'job',
          },
        },
        { $unwind: '$job' },
        {
          $group: {
            _id: '$job.service_id',
            avg_rating: { $avg: '$rating' },
            total_reviews: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'services',
            localField: '_id',
            foreignField: '_id',
            as: 'service',
          },
        },
        {
          $project: {
            service_id: '$_id',
            service_name: { $arrayElemAt: ['$service.name', 0] },
            avg_rating: { $round: ['$avg_rating', 1] },
            total_reviews: 1,
            _id: 0,
          },
        },
        { $sort: { avg_rating: -1 } },
      ])
      .exec();
  }

  // ─── Summary stats ─────────────────────────────────────────────────────────

  async getSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      thisMonthJobs,
      lastMonthJobs,
      thisMonthRevenue,
      lastMonthRevenue,
      thisMonthUsers,
      lastMonthUsers,
      avgRating,
    ] = await Promise.all([
      this.jobModel.countDocuments({ created_at: { $gte: startOfMonth } }).exec(),
      this.jobModel
        .countDocuments({ created_at: { $gte: startOfLastMonth, $lte: endOfLastMonth } })
        .exec(),
      this.transactionModel
        .aggregate([
          { $match: { type: 'payment', status: 'success', created_at: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .exec(),
      this.transactionModel
        .aggregate([
          {
            $match: {
              type: 'payment',
              status: 'success',
              created_at: { $gte: startOfLastMonth, $lte: endOfLastMonth },
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .exec(),
      this.userModel.countDocuments({ created_at: { $gte: startOfMonth }, is_deleted: false }).exec(),
      this.userModel
        .countDocuments({
          created_at: { $gte: startOfLastMonth, $lte: endOfLastMonth },
          is_deleted: false,
        })
        .exec(),
      this.reviewModel.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' } } }]).exec(),
    ]);

    const thisMonthRev = thisMonthRevenue[0]?.total ?? 0;
    const lastMonthRev = lastMonthRevenue[0]?.total ?? 0;
    const avg = avgRating[0]?.avg ?? 0;

    return {
      jobs: {
        this_month: thisMonthJobs,
        last_month: lastMonthJobs,
        growth_pct:
          lastMonthJobs > 0
            ? Math.round(((thisMonthJobs - lastMonthJobs) / lastMonthJobs) * 100)
            : 0,
      },
      revenue: {
        this_month: thisMonthRev,
        last_month: lastMonthRev,
        growth_pct:
          lastMonthRev > 0
            ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100)
            : 0,
      },
      users: {
        this_month: thisMonthUsers,
        last_month: lastMonthUsers,
        growth_pct:
          lastMonthUsers > 0
            ? Math.round(((thisMonthUsers - lastMonthUsers) / lastMonthUsers) * 100)
            : 0,
      },
      avg_rating: Math.round(avg * 10) / 10,
    };
  }
}

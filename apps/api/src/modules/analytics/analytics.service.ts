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
              $dateToString: { format: '%Y-%m-%d', date: '$created_at', timezone: '+07:00' },
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

  // B89: doanh thu theo tháng = tổng thu (payment) − tiền hoàn (refund) − phí
  // (commission/phí sàn). Trả cả gross và net để admin đối soát.
  async getRevenuePerMonth(months = 6) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const rows = await this.transactionModel
      .aggregate([
        {
          $match: {
            type: { $in: ['payment', 'refund', 'commission'] },
            status: 'success',
            created_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: '%Y-%m', date: '$created_at', timezone: '+07:00' } },
              type: '$type',
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.month': 1 } },
      ])
      .exec();
    const byMonth = new Map<
      string,
      { gross: number; refunds: number; fees: number; count: number }
    >();
    for (const r of rows as any[]) {
      const m = r._id.month as string;
      const cur = byMonth.get(m) ?? { gross: 0, refunds: 0, fees: 0, count: 0 };
      if (r._id.type === 'payment') {
        cur.gross += r.total;
        cur.count += r.count;
      } else if (r._id.type === 'refund') cur.refunds += r.total;
      else if (r._id.type === 'commission') cur.fees += r.total;
      byMonth.set(m, cur);
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({
        month,
        total: v.gross - v.refunds - v.fees, // net — giữ key 'total' cho client cũ
        gross: v.gross,
        refunds: v.refunds,
        fees: v.fees,
        net: v.gross - v.refunds - v.fees,
        count: v.count,
      }));
  }

  /** B89: cộng dồn 1 kỳ: { gross, refunds, fees, net } */
  private async sumRevenue(
    from: Date,
    to?: Date,
  ): Promise<{ gross: number; refunds: number; fees: number; net: number }> {
    const match: Record<string, unknown> = {
      type: { $in: ['payment', 'refund', 'commission'] },
      status: 'success',
      created_at: to ? { $gte: from, $lte: to } : { $gte: from },
    };
    const rows = await this.transactionModel
      .aggregate([{ $match: match }, { $group: { _id: '$type', total: { $sum: '$amount' } } }])
      .exec();
    let gross = 0,
      refunds = 0,
      fees = 0;
    for (const r of rows as any[]) {
      if (r._id === 'payment') gross = r.total;
      else if (r._id === 'refund') refunds = r.total;
      else if (r._id === 'commission') fees = r.total;
    }
    return { gross, refunds, fees, net: gross - refunds - fees };
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
              $dateToString: { format: '%Y-%m-%d', date: '$created_at', timezone: '+07:00' },
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
    // T2: Mốc tháng theo múi giờ Việt Nam Asia/Ho_Chi_Minh (UTC+7)
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const vnYear = vnNow.getUTCFullYear();
    const vnMonth = vnNow.getUTCMonth(); // 0-based
    const startOfMonth = new Date(Date.UTC(vnYear, vnMonth, 1) - 7 * 60 * 60 * 1000);
    const startOfLastMonth = new Date(Date.UTC(vnYear, vnMonth - 1, 1) - 7 * 60 * 60 * 1000);
    const endOfLastMonth = new Date(Date.UTC(vnYear, vnMonth, 0, 23, 59, 59, 999) - 7 * 60 * 60 * 1000);

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
      this.sumRevenue(startOfMonth),
      this.sumRevenue(startOfLastMonth, endOfLastMonth),
      this.userModel
        .countDocuments({ created_at: { $gte: startOfMonth }, is_deleted: false })
        .exec(),
      this.userModel
        .countDocuments({
          created_at: { $gte: startOfLastMonth, $lte: endOfLastMonth },
          is_deleted: false,
        })
        .exec(),
      this.reviewModel.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' } } }]).exec(),
    ]);

    // B89: this_month/last_month giữ nghĩa thu ròng (net) như trước;
    // gross/refunds/fees/net trả thêm để hiển thị đối soát.
    const thisMonthRev = (thisMonthRevenue as { net: number }).net;
    const lastMonthRev = (lastMonthRevenue as { net: number }).net;
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
        gross_this_month: (thisMonthRevenue as { gross: number }).gross,
        refunds_this_month: (thisMonthRevenue as { refunds: number }).refunds,
        fees_this_month: (thisMonthRevenue as { fees: number }).fees,
        net_this_month: thisMonthRev,
        gross_last_month: (lastMonthRevenue as { gross: number }).gross,
        refunds_last_month: (lastMonthRevenue as { refunds: number }).refunds,
        fees_last_month: (lastMonthRevenue as { fees: number }).fees,
        net_last_month: lastMonthRev,
        growth_pct:
          lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100) : 0,
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

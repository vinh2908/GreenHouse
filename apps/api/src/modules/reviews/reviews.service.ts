import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { CreateReviewDto, HelperReplyDto } from './dto/review.dto';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { JobStatus } from '@homemate/types';
import { NOTIFICATION_TYPES } from '@homemate/constants';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(HelperProfile.name) private helperModel: Model<HelperProfileDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Customer: Create review after job completion ──────────────────────────

  async createReview(customerId: string, dto: CreateReviewDto): Promise<ReviewDocument> {
    const job = await this.jobModel.findById(dto.job_id).exec();
    if (!job) throw new NotFoundException('Công việc không tồn tại');
    if (job.customer_id.toString() !== customerId) {
      throw new ForbiddenException('Bạn chỉ có thể đánh giá công việc của mình');
    }
    if (job.status !== JobStatus.COMPLETED || !job.helper_id) {
      throw new BadRequestException('Chỉ đánh giá được công việc đã hoàn thành');
    }

    const existing = await this.reviewModel.findOne({ job_id: job._id }).exec();
    if (existing) throw new ConflictException('Bạn đã đánh giá công việc này rồi');

    const review = await this.reviewModel.create({
      job_id: job._id,
      customer_id: new Types.ObjectId(customerId),
      helper_id: job.helper_id,
      rating: dto.rating,
      comment: dto.comment,
      rating_punctuality: dto.rating_punctuality,
      rating_quality: dto.rating_quality,
      rating_attitude: dto.rating_attitude,
      tags: dto.tags ?? [],
    });

    await this.syncHelperRating(String(job.helper_id));
    await this.notificationsService
      .create({
        userId: String(job.helper_id),
        type: NOTIFICATION_TYPES.REVIEW_RECEIVED,
        title: `Bạn nhận được đánh giá ${dto.rating}★`,
        body: dto.comment
          ? `"${dto.comment.slice(0, 100)}" — ${job.title}`
          : `Công việc "${job.title}"`,
        payload: { job_id: String(job._id), review_id: String(review._id) },
      })
      .catch(() => undefined);
    return review;
  }

  // Keep the denormalised rating on the helper profile in step with the reviews collection.
  private async syncHelperRating(helperId: string) {
    const stats = await this.getHelperRatingStats(helperId);
    await this.helperModel
      .updateOne(
        { user_id: new Types.ObjectId(helperId) },
        { rating: stats.average_rating, total_reviews: stats.total_reviews },
      )
      .exec();
  }

  // ─── Helper: Reply to review ───────────────────────────────────────────────

  async replyToReview(
    helperId: string,
    reviewId: string,
    dto: HelperReplyDto,
  ): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) throw new NotFoundException('Đánh giá không tồn tại');
    if (review.helper_id.toString() !== helperId) throw new ForbiddenException();
    if (review.helper_reply) throw new BadRequestException('Bạn đã phản hồi đánh giá này rồi');

    review.helper_reply = dto.reply;
    review.helper_replied_at = new Date();
    return review.save();
  }

  // ─── Get reviews for a helper ─────────────────────────────────────────────

  async getHelperReviews(helperId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find({ helper_id: new Types.ObjectId(helperId) })
        .populate('customer_id', 'full_name avatar')
        .populate('job_id', 'title')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments({ helper_id: new Types.ObjectId(helperId) }).exec(),
    ]);

    return { reviews, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ─── Get rating stats for a helper ────────────────────────────────────────

  async getHelperRatingStats(helperId: string) {
    const stats = await this.reviewModel
      .aggregate([
        { $match: { helper_id: new Types.ObjectId(helperId) } },
        {
          $group: {
            _id: null,
            average_rating: { $avg: '$rating' },
            total_reviews: { $sum: 1 },
            avg_punctuality: { $avg: '$rating_punctuality' },
            avg_quality: { $avg: '$rating_quality' },
            avg_attitude: { $avg: '$rating_attitude' },
            rating_1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            rating_2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            rating_3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            rating_4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            rating_5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          },
        },
      ])
      .exec();

    if (!stats.length) {
      return {
        average_rating: 0,
        total_reviews: 0,
        rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    const s = stats[0];
    return {
      average_rating: Math.round(s.average_rating * 10) / 10,
      total_reviews: s.total_reviews,
      avg_punctuality: s.avg_punctuality ? Math.round(s.avg_punctuality * 10) / 10 : null,
      avg_quality: s.avg_quality ? Math.round(s.avg_quality * 10) / 10 : null,
      avg_attitude: s.avg_attitude ? Math.round(s.avg_attitude * 10) / 10 : null,
      rating_breakdown: {
        1: s.rating_1,
        2: s.rating_2,
        3: s.rating_3,
        4: s.rating_4,
        5: s.rating_5,
      },
    };
  }

  // ─── Get review for a specific job ───────────────────────────────────────

  async getReviewByJob(jobId: string): Promise<ReviewDocument | null> {
    return this.reviewModel
      .findOne({ job_id: new Types.ObjectId(jobId) })
      .populate('customer_id', 'full_name avatar')
      .exec();
  }

  // ─── Get reviews written by a customer ───────────────────────────────────

  async getCustomerReviews(customerId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find({ customer_id: new Types.ObjectId(customerId) })
        .populate('helper_id', 'full_name avatar')
        .populate('job_id', 'title')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments({ customer_id: new Types.ObjectId(customerId) }).exec(),
    ]);
    return { reviews, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ─── Admin: Get all reviews ───────────────────────────────────────────────

  async getAllReviews(minRating?: number, maxRating?: number, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (minRating || maxRating) {
      query['rating'] = {};
      if (minRating) (query['rating'] as Record<string, unknown>)['$gte'] = minRating;
      if (maxRating) (query['rating'] as Record<string, unknown>)['$lte'] = maxRating;
    }
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(query)
        .populate('customer_id', 'full_name avatar')
        .populate('helper_id', 'full_name avatar')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments(query).exec(),
    ]);
    return { reviews, total, page, limit, total_pages: Math.ceil(total / limit) };
  }
}

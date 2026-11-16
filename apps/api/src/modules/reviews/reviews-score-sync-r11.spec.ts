import { Types } from 'mongoose';
import { JobStatus } from '@homemate/types';
import { ReviewsService } from './reviews.service';

/**
 * R11 (Copilot review): performance_score phải được tính lại ngay khi có
 * đánh giá mới. syncHelperRating chỉ đồng bộ rating/total_reviews mà không
 * chạm tới performance_score, trong khi điểm này được hiển thị trực tiếp
 * trên thẻ thợ SOS (sos-backup-helper-card.tsx) — sau 1 đánh giá 5★, thẻ
 * SOS vẫn hiện điểm cũ cho tới lần hủy/miễn phạt tiếp theo.
 * Hoàn thành đơn KHÔNG cần tính lại: completed_jobs không phải input của
 * công thức điểm (chỉ distance/hasService/rating/isVerified/cancellations).
 */
describe('ReviewsService — recompute performance_score on review (R11)', () => {
  const customerId = new Types.ObjectId().toString();
  const helperId = new Types.ObjectId().toString();
  const jobId = new Types.ObjectId().toString();

  function makeService(profile: any) {
    const job = {
      _id: new Types.ObjectId(jobId),
      customer_id: new Types.ObjectId(customerId),
      helper_id: new Types.ObjectId(helperId),
      status: JobStatus.COMPLETED,
      title: 'Dọn nhà',
    };
    const jobModel = {
      findById: jest.fn().mockReturnValue({ exec: async () => job }),
    } as any;
    const reviewModel = {
      findOne: jest.fn().mockReturnValue({ exec: async () => null }),
      create: jest.fn(async (doc: any) => ({ ...doc, _id: new Types.ObjectId() })),
      aggregate: jest.fn().mockReturnValue({
        exec: async () => [
          {
            average_rating: 5,
            total_reviews: 1,
            rating_1: 0,
            rating_2: 0,
            rating_3: 0,
            rating_4: 0,
            rating_5: 1,
            avg_punctuality: 5,
            avg_quality: 5,
            avg_attitude: 5,
          },
        ],
      }),
    } as any;
    const helperModel = {
      findOne: jest.fn().mockReturnValue({ exec: async () => profile }),
      // Code cũ dùng updateOne (chỉ đồng bộ rating, không tính lại điểm).
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    } as any;
    const notificationsService = { create: jest.fn().mockResolvedValue({}) } as any;
    return new ReviewsService(reviewModel, jobModel, helperModel, notificationsService);
  }

  it('đánh giá 5★ đầu tiên → rating 5 và performance_score tính lại (0 → 60)', async () => {
    const profile: any = {
      user_id: new Types.ObjectId(helperId),
      rating: 0,
      total_reviews: 0,
      verification_status: 'approved',
      service_ids: ['svc1'],
      cancellation_timestamps: [],
      performance_score: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(profile);

    await service.createReview(customerId, {
      job_id: jobId,
      rating: 5,
      comment: 'Rất tốt',
      rating_punctuality: 5,
      rating_quality: 5,
      rating_attitude: 5,
    } as never);

    expect(profile.rating).toBe(5);
    expect(profile.total_reviews).toBe(1);
    // distance -1 → 0đ, đúng chuyên môn 30đ, rating 5 → 20đ, e-KYC 10đ.
    expect(profile.performance_score).toBe(60);
    expect(profile.save).toHaveBeenCalled();
  });
});

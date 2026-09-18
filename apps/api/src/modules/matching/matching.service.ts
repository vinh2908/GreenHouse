import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { HungarianAlgorithm, AssignmentResult } from './algorithms/hungarian.algorithm';
import { HelperStatus, VerificationStatus, JobStatus } from '@homemate/types';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SOCKET_EVENTS, NOTIFICATION_TYPES } from '@homemate/constants';

export interface MatchPair {
  job: {
    _id: string;
    title: string;
    district: string;
  };
  helper: {
    _id: string;
    full_name: string;
    phone: string;
    average_rating: number;
    distance_km: number;
  };
  match_score: number;
  match_reasons: string[];
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(HelperProfile.name) private helperModel: Model<HelperProfileDocument>,
    private readonly gateway: AppGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Tính khoảng cách địa lý theo công thức Haversine (km)
   */
  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Bán kính Trái Đất (km)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  /**
   * Tính điểm số tương thích giữa 1 Thợ và 1 Công việc (0 - 100 điểm)
   */
  public computeUtilityScore(helper: any, job: any): { score: number; distance_km: number; reasons: string[] } {
    const reasons: string[] = [];

    // 1. Tọa độ & Khoảng cách
    const jobCoords = job.address?.location?.coordinates || [106.6983, 10.7725]; // [lon, lat]
    const helperCoords = helper.current_location?.coordinates || [106.6983, 10.7725];

    const distanceKm = this.calculateDistanceKm(
      helperCoords[1],
      helperCoords[0],
      jobCoords[1],
      jobCoords[0],
    );

    // Điểm khoảng cách: <2km -> 100đ, 10km -> 50đ, >20km -> 10đ
    const distanceScore = Math.max(0, Math.min(100, 100 - (distanceKm / 20) * 100));
    if (distanceKm <= 3) reasons.push(`Khoảng cách rất gần (${distanceKm}km)`);
    else reasons.push(`Cách ${distanceKm}km`);

    // 2. Chuyên môn (Skills / Service Match)
    const jobServiceId = job.service_id?._id?.toString() || job.service_id?.toString();
    const hasService = (helper.service_ids || []).some(
      (sId: any) => sId.toString() === jobServiceId,
    );
    const skillScore = hasService ? 100 : 40;
    if (hasService) reasons.push('Đúng chuyên môn yêu cầu');

    // 3. Đánh giá sao (Rating 1 - 5 sao -> 0 - 100đ)
    const rating = helper.average_rating || 5.0;
    const ratingScore = ((rating - 1) / 4) * 100;
    if (rating >= 4.8) reasons.push(`Uy tín cao: ★ ${rating.toFixed(1)}`);

    // 4. Xác thực e-KYC (100đ hoặc 0đ)
    const isVerified = helper.verification_status === VerificationStatus.APPROVED;
    const kycScore = isVerified ? 100 : 0;
    if (isVerified) reasons.push('Đã xác minh e-KYC');

    // Tổng hợp điểm số trọng số:
    // Distance 40% + Skill 30% + Rating 20% + KYC 10%
    const totalScore = Math.round(
      distanceScore * 0.4 + skillScore * 0.3 + ratingScore * 0.2 + kycScore * 0.1,
    );

    return {
      score: totalScore,
      distance_km: distanceKm,
      reasons,
    };
  }

  /**
   * Ghép cặp tối ưu hàng loạt (Batch Matching với Hungarian Algorithm)
   * Phân bổ N thợ <-> M công việc sao cho tổng điểm hữu dụng toàn hệ thống là LỚN NHẤT
   */
  async matchBatchJobs(): Promise<{ total_matched: number; matches: MatchPair[]; matrix_size: string }> {
    // 1. Lấy danh sách công việc đang chờ (OPEN)
    const openJobs = await this.jobModel
      .find({ status: { $in: [JobStatus.OPEN, JobStatus.RECEIVING_QUOTES] } })
      .populate('service_id', 'name slug')
      .limit(20)
      .exec();

    // 2. Lấy danh sách thợ đang ONLINE & Đã xác minh e-KYC
    const onlineHelpers = await this.helperModel
      .find({
        status: HelperStatus.ONLINE,
        verification_status: VerificationStatus.APPROVED,
      })
      .populate('user_id', 'full_name phone avatar')
      .limit(20)
      .exec();

    if (openJobs.length === 0 || onlineHelpers.length === 0) {
      return {
        total_matched: 0,
        matches: [],
        matrix_size: `${onlineHelpers.length} thợ x ${openJobs.length} đơn`,
      };
    }

    // 3. Xây dựng ma trận điểm lợi ích Score Matrix [Helpers x Jobs]
    const scoreMatrix: number[][] = [];
    const detailsMatrix: { distance_km: number; reasons: string[] }[][] = [];

    for (let i = 0; i < onlineHelpers.length; i++) {
      scoreMatrix[i] = [];
      detailsMatrix[i] = [];
      for (let j = 0; j < openJobs.length; j++) {
        const { score, distance_km, reasons } = this.computeUtilityScore(
          onlineHelpers[i],
          openJobs[j],
        );
        scoreMatrix[i][j] = score;
        detailsMatrix[i][j] = { distance_km, reasons };
      }
    }

    // 4. Giải bài toán phân bổ tối ưu bằng Hungarian Algorithm
    const assignments: AssignmentResult[] = HungarianAlgorithm.maximize(scoreMatrix);

    // 5. Tổng hợp kết quả ghép cặp
    const matches: MatchPair[] = assignments.map(a => {
      const h = onlineHelpers[a.workerIndex];
      const j = openJobs[a.jobIndex];
      const details = detailsMatrix[a.workerIndex][a.jobIndex];
      const user = h.user_id as any;

      return {
        job: {
          _id: String(j._id),
          title: j.title,
          district: j.address?.district || 'Quận 1',
        },
        helper: {
          _id: String(user?._id || h.user_id),
          full_name: user?.full_name || 'Thợ đối tác',
          phone: user?.phone || '',
          average_rating: h.rating || (h as any).average_rating || 5.0,
          distance_km: details.distance_km,
        },
        match_score: a.score,
        match_reasons: details.reasons,
      };
    });

    this.logger.log(`Hungarian matching completed: ${matches.length} pairs matched optimally.`);

    return {
      total_matched: matches.length,
      matches,
      matrix_size: `${onlineHelpers.length} thợ x ${openJobs.length} đơn`,
    };
  }

  /**
   * Tìm và xếp hạng các thợ tối ưu nhất cho 1 công việc cụ thể
   */
  async findOptimalHelpersForJob(jobId: string, limit = 5): Promise<MatchPair[]> {
    const job = await this.jobModel.findById(jobId).populate('service_id').exec();
    if (!job) throw new NotFoundException('Công việc không tồn tại');

    const helpers = await this.helperModel
      .find({
        status: HelperStatus.ONLINE,
        verification_status: VerificationStatus.APPROVED,
      })
      .populate('user_id', 'full_name phone avatar')
      .exec();

    const scored = helpers.map(h => {
      const { score, distance_km, reasons } = this.computeUtilityScore(h, job);
      const user = h.user_id as any;
      return {
        job: {
          _id: String(job._id),
          title: job.title,
          district: job.address?.district || 'Quận 1',
        },
        helper: {
          _id: String(user?._id || h.user_id),
          full_name: user?.full_name || 'Thợ đối tác',
          phone: user?.phone || '',
          average_rating: h.rating || (h as any).average_rating || 5.0,
          distance_km,
        },
        match_score: score,
        match_reasons: reasons,
      };
    });

    scored.sort((a, b) => b.match_score - a.match_score);
    return scored.slice(0, limit);
  }
}

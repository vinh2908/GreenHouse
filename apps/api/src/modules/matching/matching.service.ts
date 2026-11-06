import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { HungarianAlgorithm, AssignmentResult } from './algorithms/hungarian.algorithm';
import { HelperStatus, VerificationStatus, JobStatus, UserRole } from '@homemate/types';
import { AppGateway } from '../chat/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchingCacheService } from './matching-cache.service';
import { SOCKET_EVENTS, NOTIFICATION_TYPES } from '@homemate/constants';
import { computeJobFitScore } from '../helpers/utils/helper-score';

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
    private readonly cache: MatchingCacheService,
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
  // B87: công thức điểm phù hợp đơn sống trong module dùng chung
  // helpers/utils/helper-score.ts (computeJobFitScore) — giữ nguyên trọng số
  // Distance 40% + Skill 30% + Rating 20% + KYC 10%. Hàm này chỉ trích xuất
  // đầu vào từ helper/job rồi gọi hàm dùng chung.
  public computeUtilityScore(
    helper: any,
    job: any,
  ): { score: number; distance_km: number; reasons: string[] } {
    const jobCoords = job.address?.location?.coordinates; // [lon, lat]
    const helperCoords = helper.location?.coordinates;
    const hasCoords = !!jobCoords && !!helperCoords;
    const distanceKm = hasCoords
      ? this.calculateDistanceKm(helperCoords[1], helperCoords[0], jobCoords[1], jobCoords[0])
      : -1;
    const jobServiceId = job.service_id?._id?.toString() || job.service_id?.toString();
    const hasService = (helper.service_ids || []).some(
      (sId: any) => sId.toString() === jobServiceId,
    );
    return computeJobFitScore({
      distanceKm,
      hasService,
      rating: helper.rating || 0,
      isVerified: helper.verification_status === VerificationStatus.APPROVED,
    });
  }

  /**
   * Ghép cặp tối ưu hàng loạt (Batch Matching với Hungarian Algorithm)
   * Phân bổ N thợ <-> M công việc sao cho tổng điểm hữu dụng toàn hệ thống là LỚN NHẤT
   */
  async matchBatchJobs(): Promise<{
    total_matched: number;
    matches: MatchPair[];
    matrix_size: string;
  }> {
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
          district: j.address?.district || j.address?.city || 'Chưa rõ',
        },
        helper: {
          _id: String(user?._id || h.user_id),
          full_name: user?.full_name || 'Thợ đối tác',
          phone: user?.phone || '',
          average_rating: h.rating || 0,
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
   * B116: khi một thợ mới trở nên phù hợp (vừa ONLINE / vừa đủ điều kiện),
   * phát event cập nhật danh sách gợi ý cho khách của các đơn đang mở mà thợ
   * đó phù hợp. Chỉ phát cho khách của đơn liên quan — không broadcast.
   */
  async notifyNewSuitableHelper(helperId: string): Promise<void> {
    const helper = await this.helperModel
      .findOne({ user_id: new Types.ObjectId(helperId) })
      .exec();
    if (!helper) return;
    if (
      helper.status !== HelperStatus.ONLINE ||
      helper.verification_status !== VerificationStatus.APPROVED
    ) {
      return;
    }
    const openJobs = await this.jobModel
      .find({
        status: { $in: [JobStatus.OPEN, JobStatus.RECEIVING_QUOTES] },
        service_id: { $in: helper.service_ids ?? [] },
      })
      .limit(20)
      .exec();
    for (const job of openJobs) {
      const { score, distance_km } = this.computeUtilityScore(helper, job);
      // Chỉ báo khi thợ thật sự phù hợp: điểm >= 50 hoặc (không có GPS thì
      // chỉ cần đúng dịch vụ). Tránh spam khách với thợ ở xa/điểm thấp.
      // computeUtilityScore trả distance_km = -1 khi thiếu tọa độ
      const hasLocation = distance_km != null && distance_km >= 0;
      if (score < 50 && hasLocation) continue;
      const payload = {
        job_id: String(job._id),
        helper_id: helperId,
        match_score: score,
        distance_km,
      };
      this.gateway.emitToJob(String(job._id), SOCKET_EVENTS.MATCHING_SUGGESTION_UPDATED, payload);
      this.gateway.emitToUser(
        String(job.customer_id),
        SOCKET_EVENTS.MATCHING_SUGGESTION_UPDATED,
        payload,
      );
    }
  }

  /**
   * Tìm và xếp hạng các thợ tối ưu nhất cho 1 công việc cụ thể
   */
  async findOptimalHelpersForJob(
    jobId: string,
    userId: string,
    userRoles?: string[],
    limit = 10,
  ): Promise<MatchPair[]> {
    // B63: mặc định 10, kẹp trong 1–20 (controller đã trả 400 cho giá trị
    // ngoài khoảng; đây là lớp phòng thủ cho caller gọi trực tiếp service).
    const take = Number.isInteger(limit) ? Math.min(20, Math.max(1, limit)) : 10;
    const job = await this.jobModel.findById(jobId).populate('service_id').exec();
    if (!job) throw new NotFoundException('Công việc không tồn tại');

    // A66: Chỉ chủ đơn hoặc Admin mới xem được danh sách thợ gợi ý
    const isAdmin = (userRoles ?? []).includes(UserRole.ADMIN);
    const isOwner = String(job.customer_id) === userId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Bạn không có quyền xem gợi ý thợ cho công việc này');
    }

    // B67: Trả cache nếu còn hạn (TTL 5 phút) — kiểm tra sau bước phân quyền
    const cached = await this.cache.get<MatchPair[]>(jobId, take);
    if (cached) return cached;

    // B68: Lọc trước rồi mới tính điểm — chỉ thợ đúng service của đơn
    // (bỏ lọc khi đơn không gắn service, vd đơn tự viết) và trong khu vực.
    const jobServiceId = (job.service_id as any)?._id ?? job.service_id;
    const helperFilter: Record<string, unknown> = {
      status: HelperStatus.ONLINE,
      verification_status: VerificationStatus.APPROVED,
    };
    if (jobServiceId) helperFilter.service_ids = jobServiceId;
    const helpers = await this.helperModel
      .find(helperFilter)
      .populate('user_id', 'full_name phone avatar')
      .exec();

    // Trong khu vực: ≤ 20km khi cả 2 bên đều có tọa độ; thợ chưa có tọa độ
    // vẫn giữ lại để tính điểm (không tự loại vì thiếu vị trí).
    const jobCoords = job.address?.location?.coordinates; // [lon, lat]
    const inArea = helpers.filter(h => {
      const coords = (h as any).location?.coordinates;
      if (!jobCoords || !coords) return true;
      return this.calculateDistanceKm(coords[1], coords[0], jobCoords[1], jobCoords[0]) <= 20;
    });

    const scored = inArea.map(h => {
      const { score, distance_km, reasons } = this.computeUtilityScore(h, job);
      const user = h.user_id as any;
      return {
        job: {
          _id: String(job._id),
          title: job.title,
          district: job.address?.district || job.address?.city || 'Chưa rõ',
        },
        helper: {
          _id: String(user?._id || h.user_id),
          full_name: user?.full_name || 'Thợ đối tác',
          phone: user?.phone || '',
          average_rating: h.rating || 0,
          distance_km,
        },
        match_score: score,
        match_reasons: reasons,
      };
    });

    scored.sort((a, b) => b.match_score - a.match_score);
    const result = scored.slice(0, take);
    // B67: Lưu cache 5 phút cho lần gọi sau
    await this.cache.set(jobId, take, result);
    return result;
  }

  /**
   * B67: Xoá cache gợi ý thợ của 1 đơn — gọi khi đơn thay đổi (thợ mới báo
   * giá, chọn báo giá, huỷ đơn) để lần gợi ý sau tính lại từ dữ liệu mới.
   */
  async invalidateOptimalHelpersCache(jobId: string): Promise<void> {
    await this.cache.invalidateJob(jobId);
  }
}

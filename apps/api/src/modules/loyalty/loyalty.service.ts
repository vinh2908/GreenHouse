import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LoyaltyAccount,
  LoyaltyAccountDocument,
  LoyaltyTransaction,
  LoyaltyTransactionDocument,
  LoyaltyTier,
} from './schemas/loyalty.schema';
import { Job, JobDocument, Contract, ContractDocument } from '../jobs/schemas/job.schema';
import { PaymentStatus } from '@homemate/types';
import {
  LOYALTY_EARN_VND_PER_POINT,
  LOYALTY_POINT_VALUE_VND,
  LOYALTY_MIN_REDEEM_POINTS,
  LOYALTY_TIER_SILVER_POINTS,
  LOYALTY_TIER_GOLD_POINTS,
  LOYALTY_CAP_PERCENT_REGULAR,
  LOYALTY_CAP_PERCENT_SILVER,
  LOYALTY_CAP_PERCENT_GOLD,
} from '@homemate/constants';

/**
 * Điểm thành viên & hạng khách (Feature 12).
 *
 * Nguyên tắc an toàn tiền/điểm (mirror Vouchers):
 * - "Assert-at-attach": applyPoints chỉ LƯU Ý ĐỊNH dùng điểm lên Job
 *   (loyalty_points_requested + loyalty_discount_amount snapshot), CHƯA trừ điểm.
 * - "Redeem-at-payment": điểm chỉ bị trừ nguyên tử (atomic findOneAndUpdate với
 *   điều kiện balance >= points) bên trong PaymentsService.mockPayJob, ngay lúc
 *   thanh toán thành công. Nếu lúc đó số dư không còn đủ → chặn thanh toán kèm
 *   thông báo rõ ràng để khách gỡ điểm rồi thanh toán lại (không âm thầm tính giá gốc).
 * - Earn idempotent: mỗi Job chỉ cộng điểm 1 lần (kiểm tra earn tx tồn tại +
 *   unique partial index trên (user_id, job_id, type='earn')).
 *
 * Hằng số có thể ghi đè bằng env (đọc qua ConfigService, fallback về
 * packages/constants): LOYALTY_EARN_VND_PER_POINT, LOYALTY_POINT_VALUE_VND,
 * LOYALTY_MIN_REDEEM_POINTS.
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @InjectModel(LoyaltyAccount.name)
    private accountModel: Model<LoyaltyAccountDocument>,
    @InjectModel(LoyaltyTransaction.name)
    private txModel: Model<LoyaltyTransactionDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    private readonly configService: ConfigService,
  ) {}

  // ─── Hằng số (env override) ────────────────────────────────────────────────

  private envNumber(key: string, fallback: number): number {
    const v = Number(this.configService.get<string>(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  earnVndPerPoint(): number {
    return this.envNumber('LOYALTY_EARN_VND_PER_POINT', LOYALTY_EARN_VND_PER_POINT);
  }

  pointValueVnd(): number {
    return this.envNumber('LOYALTY_POINT_VALUE_VND', LOYALTY_POINT_VALUE_VND);
  }

  minRedeemPoints(): number {
    return this.envNumber('LOYALTY_MIN_REDEEM_POINTS', LOYALTY_MIN_REDEEM_POINTS);
  }

  // ─── Hạng khách ────────────────────────────────────────────────────────────

  tierFor(lifetimePoints: number): LoyaltyTier {
    if (lifetimePoints >= LOYALTY_TIER_GOLD_POINTS) return 'gold';
    if (lifetimePoints >= LOYALTY_TIER_SILVER_POINTS) return 'silver';
    return 'regular';
  }

  tierLabel(tier: LoyaltyTier): string {
    return tier === 'gold' ? 'Vàng' : tier === 'silver' ? 'Bạc' : 'Thường';
  }

  capPercentForTier(tier: LoyaltyTier): number {
    if (tier === 'gold') return LOYALTY_CAP_PERCENT_GOLD;
    if (tier === 'silver') return LOYALTY_CAP_PERCENT_SILVER;
    return LOYALTY_CAP_PERCENT_REGULAR;
  }

  private nextTierAt(lifetimePoints: number): number | null {
    if (lifetimePoints < LOYALTY_TIER_SILVER_POINTS) return LOYALTY_TIER_SILVER_POINTS;
    if (lifetimePoints < LOYALTY_TIER_GOLD_POINTS) return LOYALTY_TIER_GOLD_POINTS;
    return null; // Đã ở hạng cao nhất
  }

  // ─── Tài khoản ─────────────────────────────────────────────────────────────

  async getOrCreateAccount(userId: string): Promise<LoyaltyAccountDocument> {
    const account = await this.accountModel
      .findOneAndUpdate(
        { user_id: new Types.ObjectId(userId) },
        { $setOnInsert: { user_id: new Types.ObjectId(userId) } },
        { upsert: true, new: true },
      )
      .exec();
    return account!;
  }

  /** Thông tin tài khoản + hạng (tạo mới nếu chưa có, giống ví) */
  async getAccount(userId: string) {
    const account = await this.getOrCreateAccount(userId);
    const tier = this.tierFor(account.lifetime_points);
    const nextTierAt = this.nextTierAt(account.lifetime_points);
    return {
      user_id: String(account.user_id),
      points_balance: account.points_balance,
      lifetime_points: account.lifetime_points,
      tier,
      tier_label: this.tierLabel(tier),
      next_tier_at: nextTierAt,
      points_to_next_tier: nextTierAt ? Math.max(0, nextTierAt - account.lifetime_points) : 0,
      redemption_cap_percent: this.capPercentForTier(tier),
      earn_vnd_per_point: this.earnVndPerPoint(),
      point_value_vnd: this.pointValueVnd(),
      min_redeem_points: this.minRedeemPoints(),
    };
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const userOid = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
    const query = userOid ? { user_id: { $in: [userOid, userId] } } : { user_id: userId };
    const [transactions, total] = await Promise.all([
      this.txModel.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).exec(),
      this.txModel.countDocuments(query).exec(),
    ]);
    return { transactions, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ─── Earn: cộng điểm khi khách nghiệm thu / hoàn thành đơn ─────────────────

  /**
   * Cộng điểm cho 1 đơn đã thanh toán. Idempotent: bỏ qua nếu đã có earn tx
   * cho đơn này. Trả về số điểm đã cộng (0 nếu không cộng).
   * Người gọi (JobsService.approveCompletion) bọc try/catch — lỗi ở đây
   * KHÔNG được làm hỏng luồng nghiệm thu.
   */
  async awardForJob(customerId: string, jobId: string, paidAmount: number): Promise<number> {
    if (!paidAmount || paidAmount <= 0) return 0;
    const points = Math.floor(paidAmount / this.earnVndPerPoint());
    if (points <= 0) return 0;

    const existing = await this.txModel
      .findOne({
        user_id: new Types.ObjectId(customerId),
        job_id: new Types.ObjectId(jobId),
        type: 'earn',
      })
      .exec();
    if (existing) return 0;

    const account = await this.accountModel
      .findOneAndUpdate(
        { user_id: new Types.ObjectId(customerId) },
        {
          $setOnInsert: { user_id: new Types.ObjectId(customerId) },
          $inc: { points_balance: points, lifetime_points: points },
        },
        { upsert: true, new: true },
      )
      .exec();

    try {
      await this.txModel.create({
        user_id: new Types.ObjectId(customerId),
        type: 'earn',
        points,
        job_id: new Types.ObjectId(jobId),
        balance_after: account!.points_balance,
        note: `Tích điểm từ đơn #${jobId.slice(-6)}`,
      });
    } catch (err) {
      // Unique partial index chặn earn trùng khi 2 request chạy đồng thời:
      // điểm đã được cộng ở request kia — hoàn lại phần vừa cộng thừa.
      this.logger.warn(
        `Loyalty earn duplicate for job ${jobId}, rolling back ${points} points: ${err instanceof Error ? err.message : err}`,
      );
      await this.accountModel
        .findOneAndUpdate(
          { user_id: new Types.ObjectId(customerId) },
          { $inc: { points_balance: -points, lifetime_points: -points } },
        )
        .exec();
      return 0;
    }
    return points;
  }

  // ─── Apply: gắn ý định dùng điểm vào đơn (chưa trừ điểm) ───────────────────

  /**
   * Chỉ cho phép gắn điểm khi đơn ĐÃ có Contract (giá chốt) và chưa thanh toán
   * — đúng thời điểm UI thanh toán trong chi tiết đơn xuất hiện. Snapshot số
   * tiền giảm lên Job; số giảm bị cap theo % hạng khách trên tổng giá hợp đồng.
   * Nếu số điểm yêu cầu vượt cap, số điểm thực gắn được tự giảm xuống mức cap
   * (không để khách mất điểm oan): loyalty_points_requested = điểm thực dùng.
   */
  async applyPoints(customerId: string, jobId: string, points: number) {
    if (!Types.ObjectId.isValid(jobId)) {
      throw new BadRequestException('Mã công việc (job_id) không hợp lệ');
    }
    const minRedeem = this.minRedeemPoints();
    if (!Number.isInteger(points) || points < minRedeem) {
      throw new BadRequestException(`Cần dùng tối thiểu ${minRedeem} điểm mỗi lần`);
    }

    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.customer_id.toString() !== customerId) throw new ForbiddenException();
    if (job.payment_status === PaymentStatus.PAID) {
      throw new BadRequestException('Đơn đã thanh toán, không thể dùng điểm');
    }

    const contract = await this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();
    if (!contract?.total_price) {
      throw new BadRequestException('Chỉ áp dụng điểm khi đơn đã có giá chốt');
    }

    const accountInfo = await this.getAccount(customerId);
    if (points > accountInfo.points_balance) {
      throw new BadRequestException(
        `Số điểm không đủ. Bạn hiện có ${accountInfo.points_balance.toLocaleString('vi-VN')} điểm`,
      );
    }

    const capAmount = Math.floor((contract.total_price * accountInfo.redemption_cap_percent) / 100);
    const maxPointsByCap = Math.floor(capAmount / this.pointValueVnd());
    if (maxPointsByCap < minRedeem) {
      throw new BadRequestException(
        `Đơn này chỉ cho phép dùng tối đa ${maxPointsByCap} điểm (hạng ${accountInfo.tier_label}: tối đa ${accountInfo.redemption_cap_percent}% giá trị đơn) — chưa đạt mức tối thiểu ${minRedeem} điểm`,
      );
    }

    const appliedPoints = Math.min(points, maxPointsByCap);
    const discountAmount = appliedPoints * this.pointValueVnd();

    job.loyalty_points_requested = appliedPoints;
    job.loyalty_discount_amount = discountAmount;
    await job.save();

    return {
      job_id: jobId,
      loyalty_points_requested: appliedPoints,
      loyalty_discount_amount: discountAmount,
      points_balance: accountInfo.points_balance,
      redemption_cap_percent: accountInfo.redemption_cap_percent,
      tier: accountInfo.tier,
    };
  }

  async removePoints(customerId: string, jobId: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.customer_id.toString() !== customerId) throw new ForbiddenException();
    if (job.payment_status === PaymentStatus.PAID) {
      throw new BadRequestException('Đơn đã thanh toán, không thể gỡ điểm');
    }
    job.loyalty_points_requested = 0;
    job.loyalty_discount_amount = 0;
    await job.save();
    return { job_id: jobId, loyalty_points_requested: 0, loyalty_discount_amount: 0 };
  }

  // ─── Redeem: trừ điểm thật tại thời điểm thanh toán ────────────────────────

  /**
   * Được PaymentsService.mockPayJob gọi cạnh block voucher. Đọc snapshot trên
   * Job; nếu đã có redeem tx cho đơn → trả lại thông tin cũ (idempotent, không
   * trừ 2 lần). Trừ điểm nguyên tử: chỉ thành công khi balance >= points.
   */
  async redeemAtPayment(
    customerId: string,
    jobId: string,
  ): Promise<{ points_redeemed: number; discount_amount: number } | null> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) return null;
    const requested = job.loyalty_points_requested ?? 0;
    const discountAmount = job.loyalty_discount_amount ?? 0;
    if (requested <= 0 || discountAmount <= 0) return null;

    const existing = await this.txModel
      .findOne({
        user_id: new Types.ObjectId(customerId),
        job_id: new Types.ObjectId(jobId),
        type: 'redeem',
      })
      .exec();
    if (existing) {
      return { points_redeemed: Math.abs(existing.points), discount_amount: discountAmount };
    }

    const updated = await this.accountModel
      .findOneAndUpdate(
        {
          user_id: new Types.ObjectId(customerId),
          points_balance: { $gte: requested },
        },
        { $inc: { points_balance: -requested } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new BadRequestException(
        'Số điểm hiện tại không đủ để thanh toán đơn này. Vui lòng gỡ điểm khỏi đơn rồi thanh toán lại.',
      );
    }

    await this.txModel.create({
      user_id: new Types.ObjectId(customerId),
      type: 'redeem',
      points: -requested,
      job_id: new Types.ObjectId(jobId),
      balance_after: updated.points_balance,
      note: `Đổi điểm cho đơn #${jobId.slice(-6)}`,
    });

    return { points_redeemed: requested, discount_amount: discountAmount };
  }

  // ─── Reversal: hoàn điểm khi hủy đơn (mirror của redeemAtPayment) ────────

  /**
   * Hoàn lại điểm đã trừ cho 1 đơn khi đơn bị hủy theo chính sách SOS Backup.
   * Nguyên tắc sổ cái: KHÔNG sửa/xóa giao dịch 'redeem' gốc — ghi 1 giao dịch
   * MỚI type 'reversal' (điểm dương, gắn job_id) và cộng lại points_balance.
   * lifetime_points không đổi (redeem vốn không trừ lifetime nên reversal
   * cũng không cộng). Idempotent: đã có 'reversal' cho đơn → trả lại thông
   * tin cũ, không cộng điểm 2 lần. Đơn không dùng điểm → null (no-op).
   */
  async reverseRedeemForJob(
    customerId: string,
    jobId: string,
  ): Promise<{ points_restored: number } | null> {
    const userOid = new Types.ObjectId(customerId);
    const jobOid = new Types.ObjectId(jobId);

    const redeem = await this.txModel
      .findOne({ user_id: userOid, job_id: jobOid, type: 'redeem' })
      .exec();
    if (!redeem) return null;

    const existingReversal = await this.txModel
      .findOne({ user_id: userOid, job_id: jobOid, type: 'reversal' })
      .exec();
    if (existingReversal) {
      return { points_restored: Math.abs(existingReversal.points) };
    }

    const points = Math.abs(redeem.points);
    if (points <= 0) return null;

    const account = await this.getOrCreateAccount(customerId);
    const updated = await this.accountModel
      .findOneAndUpdate(
        { user_id: account.user_id },
        { $inc: { points_balance: points } },
        { new: true },
      )
      .exec();

    await this.txModel.create({
      user_id: userOid,
      type: 'reversal',
      points,
      job_id: jobOid,
      balance_after: updated!.points_balance,
      note: `Hoàn điểm do hủy đơn theo SOS #${jobId.slice(-6)}`,
    });

    return { points_restored: points };
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async adminGetUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('userId không hợp lệ');
    const [account, history] = await Promise.all([
      this.getAccount(userId),
      this.getHistory(userId, 1, 20),
    ]);
    return { account, recent_history: history.transactions };
  }

  /**
   * Điều chỉnh điểm thủ công. Chỉ thay đổi points_balance — KHÔNG đổi
   * lifetime_points (hạng khách phản ánh điểm tích lũy thật từ đơn, tránh
   * admin cộng điểm khuyến mãi làm nhảy hạng ngoài ý muốn). Số dư không âm.
   */
  async adminAdjust(userId: string, points: number, note?: string) {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('userId không hợp lệ');
    if (!Number.isInteger(points) || points === 0) {
      throw new BadRequestException('Số điểm điều chỉnh phải là số nguyên khác 0');
    }
    await this.getOrCreateAccount(userId);

    const filter: Record<string, unknown> = { user_id: new Types.ObjectId(userId) };
    if (points < 0) filter['points_balance'] = { $gte: Math.abs(points) };
    const updated = await this.accountModel
      .findOneAndUpdate(filter, { $inc: { points_balance: points } }, { new: true })
      .exec();
    if (!updated) {
      throw new BadRequestException('Số dư điểm không đủ để trừ (điểm không được âm)');
    }

    const tx = await this.txModel.create({
      user_id: new Types.ObjectId(userId),
      type: 'adjust',
      points,
      balance_after: updated.points_balance,
      note: note ?? 'Điều chỉnh bởi Admin',
    });
    return { account: await this.getAccount(userId), transaction: tx };
  }
}

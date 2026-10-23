import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Voucher,
  VoucherDocument,
  VoucherRedemption,
  VoucherRedemptionDocument,
} from './schemas/voucher.schema';
import { CreateVoucherDto, UpdateVoucherDto } from './dto/voucher.dto';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { PaymentStatus } from '@homemate/types';

export interface VoucherPreview {
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_discount_amount?: number;
  min_order_amount: number;
  discount_amount: number;
  final_amount: number;
}

@Injectable()
export class VouchersService {
  constructor(
    @InjectModel(Voucher.name) private voucherModel: Model<VoucherDocument>,
    @InjectModel(VoucherRedemption.name)
    private redemptionModel: Model<VoucherRedemptionDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
  ) {}

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  /** Tính số tiền giảm cho 1 giá trị đơn (chưa kiểm tra điều kiện sử dụng) */
  computeDiscount(voucher: Voucher, amount: number): number {
    if (amount <= 0) return 0;
    if (voucher.discount_type === 'percent') {
      let discount = Math.floor((amount * voucher.discount_value) / 100);
      if (voucher.max_discount_amount && voucher.max_discount_amount > 0) {
        discount = Math.min(discount, voucher.max_discount_amount);
      }
      return Math.min(discount, amount);
    }
    return Math.min(voucher.discount_value, amount);
  }

  private async findVoucherOrThrow(code: string): Promise<VoucherDocument> {
    const voucher = await this.voucherModel.findOne({ code: this.normalizeCode(code) }).exec();
    if (!voucher) throw new BadRequestException('Mã giảm giá không tồn tại');
    return voucher;
  }

  /** Kiểm tra đầy đủ điều kiện dùng mã cho 1 khách + 1 giá trị đơn */
  private async assertUsable(
    voucher: VoucherDocument,
    userId: string,
    amount?: number,
  ): Promise<void> {
    if (!voucher.is_active) {
      throw new BadRequestException('Mã giảm giá đã bị vô hiệu hóa');
    }
    const now = new Date();
    if (voucher.valid_from && now < voucher.valid_from) {
      throw new BadRequestException('Mã giảm giá chưa tới thời gian áp dụng');
    }
    if (voucher.valid_to && now > voucher.valid_to) {
      throw new BadRequestException('Mã giảm giá đã hết hạn');
    }
    if (voucher.total_usage_limit && voucher.used_count >= voucher.total_usage_limit) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }
    if (amount !== undefined && amount < (voucher.min_order_amount ?? 0)) {
      throw new BadRequestException(
        `Đơn cần đạt tối thiểu ${(voucher.min_order_amount ?? 0).toLocaleString('vi-VN')}₫ để dùng mã này`,
      );
    }
    const userUsed = await this.redemptionModel
      .countDocuments({
        voucher_id: voucher._id,
        user_id: new Types.ObjectId(userId),
        // Chỉ tính lượt đang giữ — lượt đã reversed (trả lại khi hủy SOS) không chặn dùng lại
        status: 'redeemed',
      })
      .exec();
    if (userUsed >= (voucher.per_user_limit ?? 1)) {
      throw new BadRequestException('Bạn đã dùng mã này tối đa số lần cho phép');
    }
  }

  // ─── Customer: preview (không ghi nhận lượt dùng) ─────────────────────────

  async preview(code: string, userId: string, amount = 0): Promise<VoucherPreview> {
    const voucher = await this.findVoucherOrThrow(code);
    await this.assertUsable(voucher, userId, amount > 0 ? amount : undefined);
    const discount = this.computeDiscount(voucher, amount);
    return {
      code: voucher.code,
      discount_type: voucher.discount_type,
      discount_value: voucher.discount_value,
      max_discount_amount: voucher.max_discount_amount,
      min_order_amount: voucher.min_order_amount ?? 0,
      discount_amount: discount,
      final_amount: Math.max(0, amount - discount),
    };
  }

  /** Kiểm tra nhanh khi khách gắn mã lúc đăng job (chưa biết giá chốt) */
  async assertCodeAttachable(code: string, userId: string): Promise<VoucherDocument> {
    const voucher = await this.findVoucherOrThrow(code);
    await this.assertUsable(voucher, userId);
    return voucher;
  }

  // ─── Thanh toán: ghi nhận lượt dùng + tính giảm chính thức (atomic) ──────

  async redeemForJob(
    userId: string,
    jobId: string,
    code: string,
    amount: number,
  ): Promise<{ discount_amount: number; voucher: VoucherDocument }> {
    const voucher = await this.findVoucherOrThrow(code);
    await this.assertUsable(voucher, userId, amount);

    const discount = this.computeDiscount(voucher, amount);
    if (discount <= 0) {
      throw new BadRequestException('Mã giảm giá không áp dụng được cho đơn này');
    }

    // Tăng used_count nguyên tử, tôn trọng total_usage_limit kể cả khi gọi đồng thời
    const updated = await this.voucherModel
      .findOneAndUpdate(
        {
          _id: voucher._id,
          is_active: true,
          $or: [
            { total_usage_limit: { $exists: false } },
            { total_usage_limit: null },
            { $expr: { $lt: ['$used_count', '$total_usage_limit'] } },
          ],
        },
        { $inc: { used_count: 1 } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }

    await this.redemptionModel.create({
      voucher_id: voucher._id,
      code: voucher.code,
      user_id: new Types.ObjectId(userId),
      job_id: new Types.ObjectId(jobId),
      discount_amount: discount,
      status: 'redeemed',
    });

    return { discount_amount: discount, voucher };
  }

  // ─── Hủy đơn: trả lại lượt dùng (mirror của redeemForJob) ────────────────

  /**
   * Trả lại lượt voucher đã ghi nhận cho 1 đơn (dùng khi hủy đơn theo chính
   * sách SOS Backup). Thao tác:
   *  1. Lật trạng thái redemption 'redeemed' → 'reversed' bằng findOneAndUpdate
   *     nguyên tử — chỉ 1 lần gọi thắng, các lần sau không tìm thấy bản ghi
   *     'redeemed' nữa → idempotent, không trừ used_count 2 lần.
   *  2. Giảm voucher.used_count đi 1 (không xuống dưới 0).
   * Bản ghi redemption được GIỮ (status 'reversed') để đối soát. Voucher đã
   * hết hạn tính đến thời điểm trả lượt vẫn được ghi nhận reversed như thường
   * nhưng KHÔNG dùng lại được — assertUsable vẫn chặn theo valid_to như cũ.
   */
  async restoreForJob(
    userId: string,
    jobId: string,
  ): Promise<{ restored: boolean; discount_amount: number; code?: string }> {
    const redemption = await this.redemptionModel
      .findOneAndUpdate(
        {
          job_id: new Types.ObjectId(jobId),
          user_id: new Types.ObjectId(userId),
          status: 'redeemed',
        },
        { $set: { status: 'reversed' } },
        { new: true },
      )
      .exec();
    if (!redemption) return { restored: false, discount_amount: 0 };

    await this.voucherModel
      .findOneAndUpdate(
        { _id: redemption.voucher_id, used_count: { $gt: 0 } },
        { $inc: { used_count: -1 } },
      )
      .exec();

    return {
      restored: true,
      discount_amount: redemption.discount_amount,
      code: redemption.code,
    };
  }

  // ─── Customer: gắn / gỡ mã trên 1 job chưa thanh toán ─────────────────────

  async attachToJob(userId: string, jobId: string, code: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.customer_id.toString() !== userId) throw new ForbiddenException();
    if (job.payment_status === PaymentStatus.PAID) {
      throw new BadRequestException('Đơn đã thanh toán, không thể gắn mã giảm giá');
    }
    const voucher = await this.assertCodeAttachable(code, userId);
    job.voucher_code = voucher.code;
    await job.save();
    return { job_id: jobId, voucher_code: voucher.code };
  }

  async detachFromJob(userId: string, jobId: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Job không tồn tại');
    if (job.customer_id.toString() !== userId) throw new ForbiddenException();
    if (job.payment_status === PaymentStatus.PAID) {
      throw new BadRequestException('Đơn đã thanh toán, không thể gỡ mã giảm giá');
    }
    job.voucher_code = undefined;
    await job.save();
    return { job_id: jobId, voucher_code: null };
  }

  // ─── Customer: Danh sách voucher khả dụng của tôi ──────────────────────────

  async getMyAvailableVouchers(userId: string) {
    const now = new Date();
    const vouchers = await this.voucherModel
      .find({
        is_active: true,
        $or: [{ valid_to: { $exists: false } }, { valid_to: null }, { valid_to: { $gte: now } }],
      })
      .sort({ discount_value: -1, created_at: -1 })
      .lean()
      .exec();

    const results: any[] = [];
    for (const v of vouchers) {
      if (v.total_usage_limit && v.used_count >= v.total_usage_limit) continue;
      const userUses = await this.redemptionModel.countDocuments({
        voucher_id: v._id,
        user_id: new Types.ObjectId(userId),
        status: 'redeemed',
      });
      const perUserLimit = v.per_user_limit ?? 1;
      if (userUses < perUserLimit) {
        results.push({
          ...v,
          user_remaining_uses: perUserLimit - userUses,
        });
      }
    }
    return results;
  }

  // ─── Admin CRUD ────────────────────────────────────────────────────────────

  async adminList(search?: string, isActive?: boolean, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (search) query['code'] = { $regex: this.normalizeCode(search), $options: 'i' };
    if (isActive !== undefined) query['is_active'] = isActive;
    const skip = (page - 1) * limit;
    const [vouchers, total] = await Promise.all([
      this.voucherModel.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).exec(),
      this.voucherModel.countDocuments(query).exec(),
    ]);
    return { vouchers, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  async adminCreate(adminId: string, dto: CreateVoucherDto): Promise<VoucherDocument> {
    const code = this.normalizeCode(dto.code);
    const existing = await this.voucherModel.findOne({ code }).exec();
    if (existing) throw new ConflictException(`Mã "${code}" đã tồn tại`);
    if (dto.discount_type === 'percent' && (dto.discount_value < 1 || dto.discount_value > 100)) {
      throw new BadRequestException('Giảm theo % phải nằm trong khoảng 1–100');
    }
    return this.voucherModel.create({
      code,
      description: dto.description,
      discount_type: dto.discount_type,
      discount_value: dto.discount_value,
      max_discount_amount: dto.max_discount_amount,
      min_order_amount: dto.min_order_amount ?? 0,
      total_usage_limit: dto.total_usage_limit,
      per_user_limit: dto.per_user_limit ?? 1,
      is_active: dto.is_active ?? true,
      valid_from: dto.valid_from ? new Date(dto.valid_from) : undefined,
      valid_to: dto.valid_to ? new Date(dto.valid_to) : undefined,
      created_by: new Types.ObjectId(adminId),
    });
  }

  async adminUpdate(id: string, dto: UpdateVoucherDto): Promise<VoucherDocument> {
    const voucher = await this.voucherModel.findById(id).exec();
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');
    if (dto.description !== undefined) voucher.description = dto.description;
    if (dto.discount_type !== undefined) voucher.discount_type = dto.discount_type;
    if (dto.discount_value !== undefined) voucher.discount_value = dto.discount_value;
    if (dto.max_discount_amount !== undefined)
      voucher.max_discount_amount = dto.max_discount_amount;
    if (dto.min_order_amount !== undefined) voucher.min_order_amount = dto.min_order_amount;
    if (dto.total_usage_limit !== undefined) voucher.total_usage_limit = dto.total_usage_limit;
    if (dto.per_user_limit !== undefined) voucher.per_user_limit = dto.per_user_limit;
    if (dto.is_active !== undefined) voucher.is_active = dto.is_active;
    if (dto.valid_from !== undefined) voucher.valid_from = new Date(dto.valid_from);
    if (dto.valid_to !== undefined) voucher.valid_to = new Date(dto.valid_to);
    if (voucher.discount_type === 'percent' && voucher.discount_value > 100) {
      throw new BadRequestException('Giảm theo % không được vượt quá 100');
    }
    await voucher.save();
    return voucher;
  }

  async adminToggle(id: string): Promise<VoucherDocument> {
    const voucher = await this.voucherModel.findById(id).exec();
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');
    voucher.is_active = !voucher.is_active;
    await voucher.save();
    return voucher;
  }

  async adminRedemptions(id: string, page = 1, limit = 20) {
    const voucher = await this.voucherModel.findById(id).exec();
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');
    const skip = (page - 1) * limit;
    const [redemptions, total] = await Promise.all([
      this.redemptionModel
        .find({ voucher_id: voucher._id })
        .populate('user_id', 'full_name phone')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.redemptionModel.countDocuments({ voucher_id: voucher._id }).exec(),
    ]);
    return { redemptions, total, page, limit, total_pages: Math.ceil(total / limit) };
  }
}

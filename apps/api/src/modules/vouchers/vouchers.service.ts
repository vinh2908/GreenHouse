import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NOTIFICATION_TYPES } from '@homemate/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
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
  private readonly logger = new Logger(VouchersService.name);

  constructor(
    @InjectModel(Voucher.name) private voucherModel: Model<VoucherDocument>,
    @InjectModel(VoucherRedemption.name)
    private redemptionModel: Model<VoucherRedemptionDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
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
  // G2 (F5/B91): nhận thêm session để lần trừ voucher chạy TRONG cùng
  // transaction với thanh toán — trước đây redeem chạy ngoài transaction nên
  // lỗi giữa chừng chỉ hoàn tác thủ công ở catch. Không có session thì giữ
  // nguyên hành vi cũ (chạy thẳng, caller chịu trách nhiệm rollback).
  async redeemForJob(
    userId: string,
    jobId: string,
    code: string,
    amount: number,
    session?: ClientSession | null,
  ): Promise<{ discount_amount: number; voucher: VoucherDocument }> {
    const voucher = await this.findVoucherOrThrow(code);
    await this.assertUsable(voucher, userId, amount);

    const discount = this.computeDiscount(voucher, amount);
    if (discount <= 0) {
      throw new BadRequestException('Mã giảm giá không áp dụng được cho đơn này');
    }

    // Tăng used_count nguyên tử, tôn trọng cả total_usage_limit và per_user_limit khi gọi song song
    const userLimit = voucher.per_user_limit ?? 1;
    const updateQuery: Record<string, unknown> = {
      _id: voucher._id,
      is_active: true,
      $or: [
        { total_usage_limit: { $exists: false } },
        { total_usage_limit: null },
        { $expr: { $lt: ['$used_count', '$total_usage_limit'] } },
      ],
    };
    if (userLimit === 1) {
      updateQuery['used_user_ids'] = { $ne: new Types.ObjectId(userId) };
    }

    const updated = await this.voucherModel
      .findOneAndUpdate(
        updateQuery,
        {
          $inc: { used_count: 1 },
          ...(userLimit === 1 ? { $addToSet: { used_user_ids: new Types.ObjectId(userId) } } : {}),
        },
        { new: true, session: session ?? undefined },
      )
      .exec();
    if (!updated) {
      const currentVoucher = await this.voucherModel.findById(voucher._id).exec();
      if (currentVoucher?.used_user_ids?.some(id => String(id) === String(userId))) {
        throw new BadRequestException('Bạn đã dùng mã này tối đa số lần cho phép');
      }
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }

    await this.redemptionModel.create(
      [
        {
          voucher_id: voucher._id,
          code: voucher.code,
          user_id: new Types.ObjectId(userId),
          job_id: new Types.ObjectId(jobId),
          discount_amount: discount,
          status: 'redeemed',
        },
      ],
      { session: session ?? undefined },
    );

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
        {
          $inc: { used_count: -1 },
          $pull: { used_user_ids: new Types.ObjectId(userId) },
        },
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

  // ─── Public: Danh sách voucher đang hoạt động ────────────────────────────

  async getActiveVouchers() {
    const now = new Date();
    return this.voucherModel
      .find({
        is_active: true,
        $or: [{ valid_to: { $exists: false } }, { valid_to: null }, { valid_to: { $gte: now } }],
      })
      .sort({ discount_value: -1, created_at: -1 })
      .lean()
      .exec();
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

  // B45: Voucher admin tạo/sửa phải luôn hợp lệ — dùng chung cho create + update.
  private validateAdminVoucherInput(input: {
    discount_type?: 'percent' | 'fixed';
    discount_value?: number;
    max_discount_amount?: number;
    min_order_amount?: number;
    valid_from?: string | Date;
    valid_to?: string | Date;
  }): void {
    if (
      input.discount_type === 'percent' &&
      input.discount_value !== undefined &&
      (input.discount_value < 0 || input.discount_value > 100)
    ) {
      throw new BadRequestException('Giảm theo % phải nằm trong khoảng 0–100');
    }
    if (input.discount_value !== undefined && input.discount_value < 0) {
      throw new BadRequestException('Giá trị giảm không được âm');
    }
    if (input.max_discount_amount !== undefined && input.max_discount_amount < 0) {
      throw new BadRequestException('Mức giảm tối đa không được âm');
    }
    if (input.min_order_amount !== undefined && input.min_order_amount < 0) {
      throw new BadRequestException('Giá trị đơn tối thiểu không được âm');
    }
    if (input.valid_from && input.valid_to) {
      const from = new Date(input.valid_from);
      const to = new Date(input.valid_to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new BadRequestException('Ngày bắt đầu / ngày hết hạn không hợp lệ');
      }
      if (to <= from) {
        throw new BadRequestException('Ngày hết hạn phải sau ngày bắt đầu');
      }
    }
  }

  async adminCreate(adminId: string, dto: CreateVoucherDto): Promise<VoucherDocument> {
    const code = this.normalizeCode(dto.code);
    const existing = await this.voucherModel.findOne({ code }).exec();
    if (existing) throw new ConflictException(`Mã "${code}" đã tồn tại`);
    if (dto.discount_type === 'percent' && (dto.discount_value < 1 || dto.discount_value > 100)) {
      throw new BadRequestException('Giảm theo % phải nằm trong khoảng 1–100');
    }
    // B45: min_order ≥ 0, ngày hết hạn sau ngày bắt đầu
    this.validateAdminVoucherInput(dto);
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
    // B45: Kiểm tra lại trạng thái gộp sau khi sửa (min_order, ngày hết hạn)
    this.validateAdminVoucherInput({
      discount_type: voucher.discount_type,
      discount_value: voucher.discount_value,
      max_discount_amount: voucher.max_discount_amount,
      min_order_amount: voucher.min_order_amount,
      valid_from: voucher.valid_from,
      valid_to: voucher.valid_to,
    });
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

  // A100: Xóa voucher (chỉ khi chưa có người dùng)
  async adminDelete(id: string): Promise<{ message: string }> {
    const voucher = await this.voucherModel.findById(id).exec();
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');
    if (voucher.used_count > 0) {
      throw new BadRequestException(
        'Không thể xóa voucher đã có người sử dụng. Bạn có thể tắt voucher thay vì xóa.',
      );
    }
    const redemptionsCount = await this.redemptionModel
      .countDocuments({ voucher_id: voucher._id })
      .exec();
    if (redemptionsCount > 0) {
      throw new BadRequestException('Không thể xóa voucher đã có lịch sử áp dụng');
    }
    await this.voucherModel.findByIdAndDelete(id).exec();
    return { message: 'Đã xóa voucher thành công' };
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

  /**
   * B99: nhắc voucher sắp hết hạn trong 3 ngày — 1 lần/voucher.
   * Chỉ nhắc voucher còn hạn (chưa hết hạn), còn active; người nhận là khách
   * đã từng dùng mã và vẫn còn lượt dùng. Ghi cờ expiry_reminder_sent_at để
   * cron ngày hôm sau không nhắc lại.
   */
  @Cron('0 9 * * *')
  async remindExpiringVouchers(): Promise<{ reminded: number }> {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const vouchers = await this.voucherModel
      .find({
        is_active: true,
        valid_to: { $gt: now, $lte: in3Days },
        expiry_reminder_sent_at: null,
      })
      .exec();
    let reminded = 0;
    for (const v of vouchers) {
      const daysLeft = Math.max(
        1,
        Math.ceil((new Date(v.valid_to!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      );
      // Người nhận: khách đã từng dùng mã và chưa hết lượt dùng cá nhân
      const userIds = (v.used_user_ids ?? []).map(String);
      const redemptions = userIds.length
        ? await this.redemptionModel
            .find({ voucher_id: v._id, user_id: { $in: userIds } })
            .lean()
            .exec()
        : [];
      const usedByUser = new Map<string, number>();
      for (const r of redemptions) {
        usedByUser.set(String(r.user_id), (usedByUser.get(String(r.user_id)) ?? 0) + 1);
      }
      const recipients = userIds.filter(
        id => (usedByUser.get(id) ?? 0) < (v.per_user_limit ?? 1),
      );
      for (const userId of recipients) {
        await this.notificationsService
          .create({
            userId,
            type: NOTIFICATION_TYPES.VOUCHER_EXPIRING_SOON,
            title: 'Voucher sắp hết hạn',
            body: `Voucher ${v.code} sắp hết hạn (còn ${daysLeft} ngày). Hãy dùng trước khi hết hạn nhé!`,
            payload: { voucher_code: v.code, days_left: daysLeft },
          })
          .catch(() => undefined);
        reminded++;
      }
      await this.voucherModel
        .updateOne({ _id: v._id }, { $set: { expiry_reminder_sent_at: now } })
        .exec();
    }
    if (reminded > 0) {
      this.logger.log(`[remindExpiringVouchers] Reminded ${reminded} user(s) about expiring vouchers`);
    }
    return { reminded };
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VoucherDocument = Voucher & Document;
export type VoucherRedemptionDocument = VoucherRedemption & Document;

// ─── Voucher (Mã giảm giá) ────────────────────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Voucher {
  @Prop({ required: true, unique: true, uppercase: true, trim: true, index: true })
  code: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: ['percent', 'fixed'], required: true })
  discount_type: 'percent' | 'fixed';

  /** percent: 1–100 (%) · fixed: số tiền giảm (VNĐ) */
  @Prop({ required: true, min: 0 })
  discount_value: number;

  /** Chỉ áp dụng cho percent: mức giảm tối đa (VNĐ) */
  @Prop()
  max_discount_amount?: number;

  /** Giá trị đơn tối thiểu để dùng mã (VNĐ) */
  @Prop({ default: 0 })
  min_order_amount: number;

  /** Tổng số lượt dùng toàn hệ thống (để trống = không giới hạn) */
  @Prop()
  total_usage_limit?: number;

  /** Số lượt tối đa mỗi khách (mặc định 1) */
  @Prop({ default: 1 })
  per_user_limit: number;

  @Prop({ default: 0 })
  used_count: number;

  @Prop({ default: true, index: true })
  is_active: boolean;

  @Prop()
  valid_from?: Date;

  @Prop()
  valid_to?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  created_by?: Types.ObjectId;

  created_at: Date;
  updated_at: Date;
}

export const VoucherSchema = SchemaFactory.createForClass(Voucher);

// ─── Voucher Redemption (Lượt sử dụng) ───────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class VoucherRedemption {
  @Prop({ type: Types.ObjectId, ref: 'Voucher', required: true, index: true })
  voucher_id: Types.ObjectId;

  @Prop({ required: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Job', index: true })
  job_id?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  discount_amount: number;

  /** redeemed = đang giữ lượt dùng · reversed = đã trả lại lượt (hủy đơn theo
   *  chính sách SOS) — bản ghi được GIỮ để đối soát, không xóa lịch sử. */
  @Prop({ type: String, enum: ['redeemed', 'reversed'], default: 'redeemed' })
  status: 'redeemed' | 'reversed';

  created_at: Date;
  updated_at: Date;
}

export const VoucherRedemptionSchema = SchemaFactory.createForClass(VoucherRedemption);
VoucherRedemptionSchema.index({ voucher_id: 1, user_id: 1 });

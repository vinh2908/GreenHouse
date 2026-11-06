import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LoyaltyAccountDocument = LoyaltyAccount & Document;
export type LoyaltyTransactionDocument = LoyaltyTransaction & Document;

export type LoyaltyTier = 'regular' | 'silver' | 'gold';
export type LoyaltyTxType = 'earn' | 'redeem' | 'adjust' | 'reversal' | 'revoke';

// ─── LoyaltyAccount (Tài khoản điểm của 1 khách) ─────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class LoyaltyAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user_id: Types.ObjectId;

  /** Điểm hiện có thể đổi (bị trừ khi redeem, cộng khi earn/adjust dương) */
  @Prop({ default: 0, min: 0 })
  points_balance: number;

  /** Tổng điểm đã tích lũy trong đời (chỉ tăng khi earn) — căn cứ xếp hạng */
  @Prop({ default: 0, min: 0 })
  lifetime_points: number;

  created_at: Date;
  updated_at: Date;
}

export const LoyaltyAccountSchema = SchemaFactory.createForClass(LoyaltyAccount);

// ─── LoyaltyTransaction (Biến động điểm) ─────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class LoyaltyTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, enum: ['earn', 'redeem', 'adjust', 'reversal', 'revoke'], required: true })
  type: LoyaltyTxType;

  /** Điểm biến động (có dấu): earn/adjust dương = +, redeem = - */
  @Prop({ required: true })
  points: number;

  @Prop({ type: Types.ObjectId, ref: 'Job', index: true })
  job_id?: Types.ObjectId;

  @Prop({ required: true })
  balance_after: number;

  @Prop()
  note?: string;

  created_at: Date;
  updated_at: Date;
}

export const LoyaltyTransactionSchema = SchemaFactory.createForClass(LoyaltyTransaction);
LoyaltyTransactionSchema.index({ user_id: 1, created_at: -1 });
// Chống cộng điểm 2 lần cho cùng 1 đơn: chỉ cho phép 1 giao dịch 'earn' / 1 job.
// Partial index: chỉ áp dụng khi type='earn' và có job_id (adjust không có job_id
// vẫn tạo được nhiều bản ghi). Service vẫn kiểm tra tồn tại trước khi tạo để
// trả hành vi êm (skip) thay vì lỗi duplicate key.
LoyaltyTransactionSchema.index(
  { user_id: 1, job_id: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'earn', job_id: { $exists: true } },
  },
);
// A35: Chống đổi điểm 2 lần cho cùng 1 đơn: chỉ cho phép 1 giao dịch 'redeem' / 1 job
LoyaltyTransactionSchema.index(
  { user_id: 1, job_id: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'redeem', job_id: { $exists: true } },
  },
);
// B47: Chống hoàn điểm 2 lần cho cùng 1 đơn: chỉ cho phép 1 giao dịch 'reversal' / 1 job.
// Đây là chốt chặn nguyên tử ở tầng DB cho race 2 request hủy song song đều
// qua bước kiểm tra tồn tại — request thua sẽ vấp duplicate key và hoàn lại
// phần điểm vừa cộng thừa (xem LoyaltyService.reverseRedeemForJob).
LoyaltyTransactionSchema.index(
  { user_id: 1, job_id: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'reversal', job_id: { $exists: true } },
  },
);

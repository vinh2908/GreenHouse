import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InsuranceClaimDocument = InsuranceClaim & Document;

export type InsuranceClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'paid'
  | 'rejected';

const ClaimTimelineEntrySchema = {
  status: {
    type: String,
    enum: ['submitted', 'under_review', 'approved', 'paid', 'rejected'],
    required: true,
  },
  note: { type: String },
  actor_id: { type: Types.ObjectId, ref: 'User', required: true },
  actor_role: { type: String, required: true }, // 'customer' | 'admin' | 'system'
  at: { type: Date, default: Date.now },
};

// ─── Insurance Claim (Yêu cầu bồi thường bảo hiểm — Feature 10) ──────────────
// Khách gửi yêu cầu cho 1 đơn COMPLETED còn trong cửa sổ bảo hiểm
// (contract.warranty_days > 0 ? warranty_days : 30 ngày kể từ lúc hoàn thành).
// Admin duyệt → tiền bồi thường cộng thẳng vào ví khách qua
// PaymentsService.refundCustomer và trạng thái chuyển thẳng sang 'paid'
// ('approved' là trạng thái trung gian trong timeline/enum để dùng khi cần
// tách bước duyệt và bước chi trả về sau).

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class InsuranceClaim {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  /** Thợ của đơn tại thời điểm gửi yêu cầu (snapshot, có thể trống) */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  helper_id?: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  /** Số tiền khách đề nghị bồi thường (không bắt buộc) */
  @Prop()
  requested_amount?: number;

  /** Số tiền admin duyệt bồi thường */
  @Prop({ default: 0 })
  approved_amount: number;

  @Prop({
    type: String,
    enum: ['submitted', 'under_review', 'approved', 'paid', 'rejected'],
    default: 'submitted',
    index: true,
  })
  status: InsuranceClaimStatus;

  @Prop()
  reject_reason?: string;

  /** _id của Transaction chi trả bồi thường vào ví khách */
  @Prop()
  payout_transaction_id?: string;

  @Prop({ type: [ClaimTimelineEntrySchema], default: [] })
  timeline: {
    status: InsuranceClaimStatus;
    note?: string;
    actor_id: Types.ObjectId;
    actor_role: string;
    at: Date;
  }[];

  created_at: Date;
  updated_at: Date;
}

export const InsuranceClaimSchema = SchemaFactory.createForClass(InsuranceClaim);
InsuranceClaimSchema.index({ customer_id: 1, status: 1 });
InsuranceClaimSchema.index({ job_id: 1, status: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HelperPenaltyEventDocument = HelperPenaltyEvent & Document;

/**
 * Sổ audit điểm phạt hủy đơn của thợ — 1 bản ghi cho mỗi lần hủy VƯỢT ngưỡng
 * (lần hủy thứ 4 trở đi trong cửa sổ trượt 7 ngày), để admin đối soát về sau.
 * Các lần hủy trong ngưỡng không bị phạt nên không ghi ở đây (lịch sử hủy đầy
 * đủ nằm ở HelperProfile.cancellation_timestamps + sự kiện của từng đơn).
 */
@Schema({ timestamps: { createdAt: 'created_at', updatedAt: false }, versionKey: false })
export class HelperPenaltyEvent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  helper_id: Types.ObjectId;

  @Prop({ type: String, enum: ['job_cancel', 'sos_initiation'], required: true })
  source: 'job_cancel' | 'sos_initiation';

  @Prop({ type: Types.ObjectId, ref: 'Job', required: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SosBackupRequest' })
  sos_id?: Types.ObjectId;

  /** Tổng số lần hủy trong cửa sổ 7 ngày NGAY SAU lần hủy này */
  @Prop({ required: true })
  cancellations_in_window: number;

  /** Số lần vượt ngưỡng tại thời điểm ghi (cancellations_in_window − ngưỡng) */
  @Prop({ required: true })
  excess_count: number;

  /** Điểm bị trừ bởi chính lần hủy này (điểm/lần vượt theo cấu hình) */
  @Prop({ required: true })
  points_deducted: number;

  /** Điểm hiệu suất tổng sau khi áp phạt — phục vụ đối soát */
  @Prop({ required: true })
  performance_score_after: number;

  created_at: Date;
}

export const HelperPenaltyEventSchema = SchemaFactory.createForClass(HelperPenaltyEvent);
HelperPenaltyEventSchema.index({ helper_id: 1, created_at: -1 });

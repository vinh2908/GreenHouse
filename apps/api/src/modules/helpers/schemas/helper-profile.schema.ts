import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HelperStatus, VerificationStatus } from '@homemate/types';

export type HelperProfileDocument = HelperProfile & Document;

/**
 * Lịch làm việc của thợ (Feature 13).
 * days_of_week dùng quy ước JS Date.getDay(): 0 = Chủ nhật, 1 = Thứ 2, …, 6 = Thứ 7.
 * blocked_dates là các ngày nghỉ lẻ theo định dạng 'YYYY-MM-DD' (ngày địa phương).
 */
export interface HelperAvailability {
  enabled: boolean;
  days_of_week: number[];
  start_time: string; // 'HH:mm'
  end_time: string; // 'HH:mm'
  blocked_dates: string[]; // 'YYYY-MM-DD'
}

export const DEFAULT_HELPER_AVAILABILITY: HelperAvailability = {
  enabled: false,
  days_of_week: [0, 1, 2, 3, 4, 5, 6],
  start_time: '07:00',
  end_time: '19:00',
  blocked_dates: [],
};

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class HelperProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  user_id: Types.ObjectId;

  @Prop({ maxlength: 500 })
  bio?: string;

  @Prop({ default: 0, min: 0 })
  years_experience: number;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ type: [Types.ObjectId], ref: 'Service', default: [] })
  service_ids: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  working_areas: string[];

  @Prop({ type: Object })
  location?: { type: 'Point'; coordinates: [number, number] };

  // manual = address the helper pinned in their profile; periodic GPS updates must not overwrite it.
  @Prop({ type: String, enum: ['manual', 'gps'] })
  location_source?: 'manual' | 'gps';

  @Prop()
  last_location_update?: Date;

  @Prop({ type: String, enum: HelperStatus, default: HelperStatus.OFFLINE, index: true })
  status: HelperStatus;

  @Prop({
    type: String,
    enum: VerificationStatus,
    default: VerificationStatus.UNSUBMITTED,
    index: true,
  })
  verification_status: VerificationStatus;

  // KYC
  @Prop()
  id_card_number?: string;

  @Prop()
  id_card_front?: string;

  @Prop()
  id_card_back?: string;

  @Prop()
  selfie_photo?: string;

  @Prop()
  rejection_reason?: string;

  @Prop()
  verified_at?: Date;

  // Stats & Quality / Risk Control
  @Prop({ default: 0, min: 0, max: 5 })
  rating: number;

  @Prop({ default: 0 })
  total_reviews: number;

  @Prop({ default: 0 })
  completed_jobs: number;

  @Prop({ default: 0 })
  total_quotes_sent: number;

  @Prop({ default: 0 })
  accepted_quotes: number;

  @Prop({ default: 100 })
  acceptance_rate: number;

  @Prop({ default: 100 })
  completion_rate: number;

  @Prop({ default: 0 })
  cancellation_rate: number;

  @Prop({ default: 0, min: 0, max: 100 })
  risk_score: number;

  @Prop({ default: 0 })
  dispute_count: number;

  @Prop({ default: 0 })
  late_cancellation_count: number;

  @Prop({ default: 0 })
  typical_warranty_days: number;

  @Prop({
    type: { bank_name: String, account_number: String, account_name: String },
  })
  bank_account?: { bank_name: string; account_number: string; account_name: string };

  // ── Lịch làm việc (Feature 13) ────────────────────────────────────────────
  // enabled=false (mặc định) = không lọc gì cả, thợ nhận mọi đơn như trước.
  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      days_of_week: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
      start_time: { type: String, default: '07:00' },
      end_time: { type: String, default: '19:00' },
      blocked_dates: { type: [String], default: [] },
    },
    default: () => ({
      enabled: false,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      start_time: '07:00',
      end_time: '19:00',
      blocked_dates: [],
    }),
  })
  availability: HelperAvailability;

  // ── Mục tiêu thu nhập tháng (Feature 14) ──────────────────────────────────
  @Prop({ default: 0, min: 0 })
  income_goal_monthly: number; // VNĐ/tháng, 0 = chưa đặt mục tiêu

  // ── Điểm hiệu suất (thang 100) + phạt hủy đơn ──────────────────────────────
  // Xem modules/helpers/utils/helper-score.ts: 4 tiêu chí (đánh giá 40 +
  // hoàn thành 25 + phản hồi 15 + tin cậy 20). Hủy đơn do thợ khởi xướng
  // (hủy thường sau khi chốt đơn + gửi SOS Backup) được ghi mốc thời gian;
  // trong cửa sổ trượt 7 ngày, vượt quá 3 lần thì trừ 5đ/lần vào tiêu chí
  // Độ tin cậy (sàn 0). Snapshot dưới đây được cập nhật mỗi khi có lần hủy mới.
  @Prop({ type: [Date], default: [] })
  cancellation_timestamps: Date[]; // Các mốc hủy do thợ khởi xướng (đã cắt ngoài cửa sổ khi ghi)

  @Prop({ default: 0 })
  cancellations_last_7_days: number;

  @Prop({ default: 0 })
  penalty_points: number; // Điểm đang bị trừ ở tiêu chí Độ tin cậy

  @Prop({ default: 100, min: 0, max: 100 })
  performance_score: number;

  @Prop({
    type: {
      rating: { type: Number, default: 40 },
      completion: { type: Number, default: 25 },
      responsiveness: { type: Number, default: 15 },
      reliability: { type: Number, default: 20 },
    },
    default: () => ({ rating: 40, completion: 25, responsiveness: 15, reliability: 20 }),
  })
  score_breakdown: {
    rating: number;
    completion: number;
    responsiveness: number;
    reliability: number;
  };

  @Prop()
  score_updated_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export const HelperProfileSchema = SchemaFactory.createForClass(HelperProfile);

// Virtual aliases so clients reading average_rating / total_completed or rating / completed_jobs stay consistent
HelperProfileSchema.virtual('average_rating').get(function (this: HelperProfile) {
  return this.rating ?? 0;
});
HelperProfileSchema.virtual('total_completed').get(function (this: HelperProfile) {
  return this.completed_jobs ?? 0;
});

HelperProfileSchema.index({ location: '2dsphere' }, { sparse: true });
HelperProfileSchema.index({ user_id: 1 }, { unique: true });
HelperProfileSchema.index({ status: 1, verification_status: 1 });
HelperProfileSchema.index({ service_ids: 1 });
HelperProfileSchema.index({ working_areas: 1 });
HelperProfileSchema.index({ rating: -1 });
HelperProfileSchema.index({ completion_rate: -1 });

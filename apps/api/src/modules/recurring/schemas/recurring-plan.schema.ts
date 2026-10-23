import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RecurringPlanDocument = RecurringPlan & Document;

export enum RecurringFrequency {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum RecurringPlanStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

const PlanAddressSchema = {
  full_address: { type: String, required: true },
  ward: { type: String },
  district: { type: String },
  city: { type: String },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  notes: { type: String },
};

// ─── Recurring Plan (Gói định kỳ) ─────────────────────────────────────────────
// Hệ thống tự sinh từng Job riêng lẻ trước mỗi lượt (rolling window 14 ngày).

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class RecurringPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Service', required: true })
  service_id: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: PlanAddressSchema, required: true })
  address: {
    full_address: string;
    ward?: string;
    district: string;
    city: string;
    location: { type: 'Point'; coordinates: [number, number] };
    notes?: string;
  };

  @Prop({ type: String, enum: RecurringFrequency, required: true })
  frequency: RecurringFrequency;

  /** Hàng tuần: các thứ trong tuần, 0 = Chủ nhật … 6 = Thứ 7 (theo Date.getDay) */
  @Prop({ type: [Number], default: [] })
  weekdays: number[];

  /** Hàng tháng: các ngày trong tháng (1–31, tự co về cuối tháng nếu vượt) */
  @Prop({ type: [Number], default: [] })
  month_days: number[];

  @Prop({ required: true })
  time_start: string; // 'HH:mm'

  @Prop()
  time_end?: string;

  @Prop()
  duration_hours?: number;

  @Prop({ required: true })
  start_date: Date;

  @Prop()
  end_date?: Date;

  /** Thợ quen: mỗi job sinh ra sẽ được gửi riêng cho thợ này trước */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  preferred_helper_id?: Types.ObjectId;

  @Prop({
    type: String,
    enum: RecurringPlanStatus,
    default: RecurringPlanStatus.ACTIVE,
    index: true,
  })
  status: RecurringPlanStatus;

  /** Các ngày 'YYYY-MM-DD' khách đã bỏ qua */
  @Prop({ type: [String], default: [] })
  skipped_dates: string[];

  @Prop()
  next_occurrence_at?: Date;

  @Prop({ default: 0 })
  jobs_generated: number;

  created_at: Date;
  updated_at: Date;
}

export const RecurringPlanSchema = SchemaFactory.createForClass(RecurringPlan);
RecurringPlanSchema.index({ customer_id: 1, status: 1 });
RecurringPlanSchema.index({ status: 1, next_occurrence_at: 1 });

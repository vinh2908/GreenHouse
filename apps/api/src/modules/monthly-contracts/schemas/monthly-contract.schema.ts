import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MonthlyContractDocument = MonthlyContract & Document;
export type AttendanceRecordDocument = AttendanceRecord & Document;
export type LeaveRequestDocument = LeaveRequest & Document;
export type MonthlySettlementDocument = MonthlySettlement & Document;

export type MonthlyContractStatus = 'pending' | 'active' | 'rejected' | 'cancelled' | 'ended';
export type AttendanceStatus = 'checked_in' | 'confirmed' | 'absent' | 'leave';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected';

// Cùng shape với JobAddressSchema của Job / RecurringPlan
const ContractAddressSchema = {
  full_address: { type: String, required: true },
  ward: { type: String },
  district: { type: String, required: true },
  city: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  notes: { type: String },
};

const ContractScheduleSchema = {
  /**
   * Các thứ làm việc trong tuần theo quy ước JS Date.getDay():
   * 0 = Chủ nhật, 1 = Thứ 2, …, 6 = Thứ 7.
   */
  days_of_week: { type: [Number], required: true },
  time_start: { type: String, required: true }, // 'HH:mm'
  time_end: { type: String, required: true }, // 'HH:mm'
};

// ─── Monthly Contract (Hợp đồng giúp việc theo tháng — Feature 08) ───────────
// Khách thuê 1 thợ cố định theo tháng với lịch cố định; điểm danh từng buổi,
// cuối tháng chốt lương theo số buổi đã xác nhận / tổng số buổi theo lịch.

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class MonthlyContract {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  helper_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Service' })
  service_id?: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  /** Lương thỏa thuận cho 1 tháng đầy đủ lịch (VNĐ) */
  @Prop({ required: true, min: 0 })
  monthly_salary: number;

  /** % phí sàn snapshot tại thời điểm tạo (mặc định 15%) */
  @Prop({ default: 15 })
  platform_fee_percent: number;

  @Prop({ type: ContractAddressSchema, required: true })
  address: {
    full_address: string;
    ward?: string;
    district: string;
    city: string;
    location: { type: 'Point'; coordinates: [number, number] };
    notes?: string;
  };

  @Prop({ type: ContractScheduleSchema, required: true })
  schedule: {
    days_of_week: number[]; // 0 = CN … 6 = T7 (Date.getDay)
    time_start: string;
    time_end: string;
  };

  @Prop({ required: true })
  start_date: Date;

  @Prop()
  end_date?: Date;

  @Prop({
    type: String,
    enum: ['pending', 'active', 'rejected', 'cancelled', 'ended'],
    default: 'pending',
    index: true,
  })
  status: MonthlyContractStatus;

  @Prop()
  responded_at?: Date;

  @Prop()
  ended_at?: Date;

  @Prop()
  end_reason?: string;

  created_at: Date;
  updated_at: Date;
}

export const MonthlyContractSchema = SchemaFactory.createForClass(MonthlyContract);
MonthlyContractSchema.index({ customer_id: 1, status: 1 });
MonthlyContractSchema.index({ helper_id: 1, status: 1 });

// ─── Attendance Record (Điểm danh từng buổi) ─────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class AttendanceRecord {
  @Prop({ type: Types.ObjectId, ref: 'MonthlyContract', required: true, index: true })
  contract_id: Types.ObjectId;

  /** Ngày làm việc 'YYYY-MM-DD' */
  @Prop({ required: true })
  date: string;

  @Prop({ type: String, enum: ['checked_in', 'confirmed', 'absent', 'leave'], required: true })
  status: AttendanceStatus;

  @Prop()
  checkin_at?: Date;

  @Prop()
  confirmed_at?: Date;

  @Prop()
  note?: string;

  created_at: Date;
  updated_at: Date;
}

export const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);
AttendanceRecordSchema.index({ contract_id: 1, date: 1 }, { unique: true });

// ─── Leave Request (Xin nghỉ 1 buổi) ─────────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class LeaveRequest {
  @Prop({ type: Types.ObjectId, ref: 'MonthlyContract', required: true, index: true })
  contract_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  helper_id: Types.ObjectId;

  /** Ngày xin nghỉ 'YYYY-MM-DD' */
  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: LeaveRequestStatus;

  @Prop()
  responded_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export const LeaveRequestSchema = SchemaFactory.createForClass(LeaveRequest);
LeaveRequestSchema.index({ contract_id: 1, date: 1, status: 1 });

// ─── Monthly Settlement (Chốt lương tháng) ───────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class MonthlySettlement {
  @Prop({ type: Types.ObjectId, ref: 'MonthlyContract', required: true, index: true })
  contract_id: Types.ObjectId;

  /** Tháng chốt lương 'YYYY-MM' */
  @Prop({ required: true })
  month: string;

  @Prop({ required: true })
  scheduled_days: number;

  @Prop({ required: true })
  confirmed_days: number;

  @Prop({ required: true })
  leave_days: number;

  @Prop({ required: true })
  absent_days: number;

  /** Lương thực nhận trước phí = salary × confirmed / scheduled */
  @Prop({ required: true })
  gross_amount: number;

  @Prop({ required: true })
  platform_fee: number;

  @Prop({ required: true })
  helper_receives: number;

  @Prop({ type: String, enum: ['settled'], default: 'settled' })
  status: 'settled';

  @Prop()
  settled_at?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  settled_by?: Types.ObjectId;

  created_at: Date;
  updated_at: Date;
}

export const MonthlySettlementSchema = SchemaFactory.createForClass(MonthlySettlement);
MonthlySettlementSchema.index({ contract_id: 1, month: 1 }, { unique: true });

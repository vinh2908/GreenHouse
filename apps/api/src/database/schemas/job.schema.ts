import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { JobStatus, QuoteStatus, ContractStatus, PaymentStatus } from '@homemate/types';

export type JobDocument = Job & Document;

// ─── Embedded Schemas ─────────────────────────────────────────────────────────

const JobAddressSchema = {
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

const JobEventSchema = {
  status: { type: String, enum: JobStatus, required: true },
  note: { type: String },
  actor_id: { type: Types.ObjectId, required: true },
  actor_role: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: Object },
};

// ─── Job Schema ───────────────────────────────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: '__v' })
export class Job {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Service', required: true, index: true })
  service_id: Types.ObjectId;

  @Prop({ type: String, enum: JobStatus, default: JobStatus.DRAFT, index: true })
  status: JobStatus;

  // ── Mô tả yêu cầu ──────────────────────────────────────────────────────────
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: [String], default: [] })
  videos: string[];

  // ── Địa chỉ ────────────────────────────────────────────────────────────────
  @Prop({ type: JobAddressSchema, required: true })
  address: {
    full_address: string;
    ward?: string;
    district: string;
    city: string;
    location: { type: 'Point'; coordinates: [number, number] };
    notes?: string;
  };

  // ── Thời gian mong muốn ────────────────────────────────────────────────────
  @Prop()
  preferred_date?: Date;

  @Prop()
  preferred_time_start?: string;

  @Prop()
  preferred_time_end?: string;

  @Prop({ default: false })
  is_flexible_time: boolean;

  // ── AI gợi ý giá ──────────────────────────────────────────────────────────
  @Prop({
    type: {
      min: Number,
      max: Number,
      estimated_duration: Number,
      confidence: Number,
    },
  })
  ai_price_suggestion?: {
    min: number;
    max: number;
    estimated_duration?: number;
    confidence?: number;
  };

  // ── Báo giá ────────────────────────────────────────────────────────────────
  @Prop({ default: 0 })
  total_quotes_count: number;

  @Prop({ type: Types.ObjectId, ref: 'Quote' })
  selected_quote_id?: Types.ObjectId;

  // ── Helper được chọn ──────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  helper_id?: Types.ObjectId;

  // ── Thanh toán ────────────────────────────────────────────────────────────
  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.UNPAID })
  payment_status: PaymentStatus;

  @Prop()
  payment_method?: string;

  // ── Kết quả ───────────────────────────────────────────────────────────────
  @Prop({ type: [String], default: [] })
  completion_photos: string[];

  @Prop({ min: 1, max: 5 })
  customer_rating?: number;

  @Prop()
  customer_review?: string;

  @Prop({ min: 1, max: 5 })
  helper_rating?: number;

  @Prop()
  helper_review?: string;

  // ── Audit Trail ───────────────────────────────────────────────────────────
  @Prop({ type: [JobEventSchema], default: [] })
  events: {
    status: JobStatus;
    note?: string;
    actor_id: Types.ObjectId;
    actor_role: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }[];

  @Prop()
  cancellation_reason?: string;

  @Prop({ type: Types.ObjectId })
  cancelled_by?: Types.ObjectId;

  @Prop()
  expires_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// Indexes
JobSchema.index({ customer_id: 1, status: 1 });
JobSchema.index({ helper_id: 1, status: 1 });
JobSchema.index({ service_id: 1, status: 1 });
JobSchema.index({ 'address.location': '2dsphere' }); // Geo: tìm jobs gần helper
JobSchema.index({ status: 1, created_at: -1 });
JobSchema.index({ status: 1, expires_at: 1 });
JobSchema.index({ created_at: -1 });

// ─── Quote Schema ─────────────────────────────────────────────────────────────

export type QuoteDocument = Quote & Document;

const MaterialsBreakdownSchema = {
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit_price: { type: Number, required: true },
};

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Quote {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  helper_id: Types.ObjectId;

  @Prop({ type: String, enum: QuoteStatus, default: QuoteStatus.PENDING, index: true })
  status: QuoteStatus;

  // Báo giá chi tiết
  @Prop({ required: true, min: 0 })
  labor_cost: number;

  @Prop({ default: 0, min: 0 })
  materials_cost: number;

  @Prop({ required: true, min: 0 })
  total_price: number;

  @Prop({ default: 0 })
  platform_fee: number;

  @Prop({ default: 0 })
  helper_receives: number;

  @Prop({ required: true, min: 0.5 })
  estimated_duration: number; // hours

  @Prop({ default: 0, min: 0 })
  warranty_days: number;

  @Prop()
  notes?: string;

  @Prop({ type: [MaterialsBreakdownSchema], default: [] })
  materials_breakdown: {
    name: string;
    quantity: number;
    unit_price: number;
  }[];

  @Prop()
  available_date?: Date;

  @Prop()
  available_time_start?: string;

  @Prop()
  available_time_end?: string;

  @Prop({ required: true })
  expires_at: Date;

  created_at: Date;
  updated_at: Date;
}

export const QuoteSchema = SchemaFactory.createForClass(Quote);

QuoteSchema.index({ job_id: 1, helper_id: 1 }, { unique: true }); // 1 helper chỉ quote 1 lần / job
QuoteSchema.index({ job_id: 1, status: 1 });
QuoteSchema.index({ helper_id: 1, status: 1 });
QuoteSchema.index({ expires_at: 1 });

// ─── Contract Schema (Hợp đồng số) ───────────────────────────────────────────

export type ContractDocument = Contract & Document;

const ContractAmendmentSchema = {
  proposed_by: { type: Types.ObjectId, required: true },
  proposed_role: { type: String, required: true },
  changes: { type: Object },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  created_at: { type: Date, default: Date.now },
};

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Contract {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, unique: true, index: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Quote', required: true })
  quote_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  helper_id: Types.ObjectId;

  @Prop({ type: String, enum: ContractStatus, default: ContractStatus.ACTIVE })
  status: ContractStatus;

  // Điều khoản chốt
  @Prop({ required: true })
  labor_cost: number;

  @Prop({ default: 0 })
  materials_cost: number;

  @Prop({ required: true })
  total_price: number;

  @Prop({ default: 0 })
  platform_fee: number;

  @Prop({ required: true })
  helper_receives: number;

  @Prop({ default: 0 })
  warranty_days: number;

  @Prop({ required: true })
  scheduled_at: Date;

  // Evidence
  @Prop({ type: [String], default: [] })
  before_photos: string[];

  @Prop({ type: [String], default: [] })
  after_photos: string[];

  // Amendments
  @Prop({ type: [ContractAmendmentSchema], default: [] })
  amendments: {
    proposed_by: Types.ObjectId;
    proposed_role: string;
    changes: Record<string, unknown>;
    reason: string;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: Date;
  }[];

  @Prop()
  signed_by_customer_at?: Date;

  @Prop()
  signed_by_helper_at?: Date;

  @Prop()
  completed_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);
ContractSchema.index({ customer_id: 1 });
ContractSchema.index({ helper_id: 1 });
ContractSchema.index({ status: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ServiceStatus } from '@homemate/types';

export type ServiceDocument = Service & Document;
export type ServiceCategoryDocument = ServiceCategory & Document;

// ─── Service Category ─────────────────────────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class ServiceCategory {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  description?: string;

  @Prop()
  icon?: string;

  @Prop({ type: String, enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  status: ServiceStatus;

  @Prop({ default: 0 })
  sort_order: number;

  created_at: Date;
}

export const ServiceCategorySchema = SchemaFactory.createForClass(ServiceCategory);

// ─── Service ──────────────────────────────────────────────────────────────────
//
// Model Vua Thợ: KHÔNG có giá cố định.
// Helper tự báo giá. Platform chỉ cung cấp:
//   - price_range_min / price_range_max: gợi ý giá thị trường
//   - AI sẽ phân tích thêm từ mô tả + ảnh của customer

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Service {
  @Prop({ type: Types.ObjectId, ref: 'ServiceCategory', required: true, index: true })
  category_id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  icon?: string;

  @Prop()
  banner_image?: string;

  @Prop({ type: String, enum: ServiceStatus, default: ServiceStatus.ACTIVE, index: true })
  status: ServiceStatus;

  // ── Gợi ý khoảng giá thị trường (không bắt buộc, chỉ tham khảo) ───────────
  @Prop({ default: 0 })
  price_range_min: number; // VND — giá thị trường tối thiểu

  @Prop({ default: 0 })
  price_range_max: number; // VND — giá thị trường tối đa

  // ── Thời gian ước tính ─────────────────────────────────────────────────────
  @Prop({ default: 1 })
  estimated_duration_min: number; // hours

  @Prop({ default: 8 })
  estimated_duration_max: number; // hours

  // ── Platform commission ────────────────────────────────────────────────────
  @Prop({ default: 15 })
  platform_fee_percent: number; // % platform thu trên tổng báo giá

  // ── Yêu cầu booking ───────────────────────────────────────────────────────
  @Prop({ default: false })
  requires_site_visit: boolean; // Cần xem nhà trước khi báo giá chính xác

  @Prop({ default: true })
  allows_video_upload: boolean;

  // ── Tags & Search ──────────────────────────────────────────────────────────
  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [String], default: [] })
  keywords: string[]; // từ khóa tìm kiếm

  // ── Stats ─────────────────────────────────────────────────────────────────
  @Prop({ default: 0 })
  total_jobs: number;

  @Prop({ default: 0 })
  total_helpers: number;

  @Prop({ default: 0 })
  avg_rating: number;

  created_at: Date;
  updated_at: Date;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);
ServiceSchema.index({ status: 1 });
ServiceSchema.index({ category_id: 1, status: 1 });
ServiceSchema.index({ tags: 1 });

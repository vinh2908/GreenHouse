import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ServiceStatus } from '@homemate/types';

export type ServiceCategoryDocument = ServiceCategory & Document;
export type ServiceDocument = Service & Document;

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
ServiceCategorySchema.index({ slug: 1 }, { unique: true });
ServiceCategorySchema.index({ status: 1, sort_order: 1 });

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Service {
  @Prop({ type: Types.ObjectId, ref: 'ServiceCategory', required: true })
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

  @Prop({ type: String, enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  status: ServiceStatus;

  @Prop({ default: 0 })
  price_range_min: number;

  @Prop({ default: 0 })
  price_range_max: number;

  @Prop({ default: 1 })
  estimated_duration_min: number;

  @Prop({ default: 8 })
  estimated_duration_max: number;

  @Prop({ default: 15 })
  platform_fee_percent: number;

  @Prop({ default: false })
  requires_site_visit: boolean;

  @Prop({ default: true })
  allows_video_upload: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [String], default: [] })
  keywords: string[];

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
ServiceSchema.index({ slug: 1 }, { unique: true });
ServiceSchema.index({ status: 1 });
ServiceSchema.index({ category_id: 1, status: 1 });
ServiceSchema.index({ tags: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ServiceStatus } from '@homemate/types';

export type ServiceDocument = Service & Document;
export type ServiceCategoryDocument = ServiceCategory & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class ServiceCategory {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
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

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Service {
  @Prop({ type: Types.ObjectId, ref: 'ServiceCategory', required: true, index: true })
  category_id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  icon?: string;

  @Prop({ type: String, enum: ServiceStatus, default: ServiceStatus.ACTIVE, index: true })
  status: ServiceStatus;

  @Prop({ required: true, min: 0 })
  base_price: number;

  @Prop({ required: true, min: 0 })
  price_per_hour: number;

  @Prop({ default: 2 })
  min_hours: number;

  @Prop({ default: 8 })
  max_hours: number;

  @Prop({ default: 15 })
  platform_fee_percent: number;

  @Prop()
  estimated_duration?: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  created_at: Date;
  updated_at: Date;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);
ServiceSchema.index({ status: 1 });
ServiceSchema.index({ category_id: 1, status: 1 });

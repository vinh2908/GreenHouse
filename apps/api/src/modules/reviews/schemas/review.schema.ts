import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, unique: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  helper_id: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number; // 1-5 sao

  @Prop({ maxlength: 1000 })
  comment?: string;

  // Detailed ratings (optional)
  @Prop({ min: 1, max: 5 })
  rating_punctuality?: number; // Đúng giờ

  @Prop({ min: 1, max: 5 })
  rating_quality?: number; // Chất lượng công việc

  @Prop({ min: 1, max: 5 })
  rating_attitude?: number; // Thái độ phục vụ

  @Prop({ type: [String], default: [] })
  tags: string[]; // 'professional', 'careful', 'fast', 'friendly', ...

  // Helper reply
  @Prop({ maxlength: 500 })
  helper_reply?: string;

  @Prop()
  helper_replied_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ job_id: 1 }, { unique: true });
ReviewSchema.index({ helper_id: 1, created_at: -1 });
ReviewSchema.index({ customer_id: 1, created_at: -1 });
ReviewSchema.index({ rating: 1 });

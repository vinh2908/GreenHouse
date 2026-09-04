import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HelperStatus, VerificationStatus } from '@homemate/types';

export type HelperProfileDocument = HelperProfile & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class HelperProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user_id: Types.ObjectId;

  @Prop()
  bio?: string;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ type: [Types.ObjectId], ref: 'Service', default: [] })
  service_ids: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  working_areas: string[];

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: undefined,
    },
  })
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };

  @Prop({ type: String, enum: HelperStatus, default: HelperStatus.OFFLINE })
  status: HelperStatus;

  @Prop({ type: String, enum: VerificationStatus, default: VerificationStatus.PENDING })
  verification_status: VerificationStatus;

  @Prop()
  id_card_front?: string;

  @Prop()
  id_card_back?: string;

  @Prop()
  id_card_number?: string;

  @Prop({ default: 0, min: 0, max: 5 })
  rating: number;

  @Prop({ default: 0 })
  total_reviews: number;

  @Prop({ default: 0 })
  completed_jobs: number;

  @Prop({ default: 100 })
  acceptance_rate: number;

  @Prop({ default: 0 })
  cancellation_rate: number;

  @Prop({ default: 0 })
  hourly_rate: number;

  @Prop()
  years_experience?: number;

  created_at: Date;
  updated_at: Date;
}

export const HelperProfileSchema = SchemaFactory.createForClass(HelperProfile);

// Geo index for nearby queries
HelperProfileSchema.index({ location: '2dsphere' });
HelperProfileSchema.index({ user_id: 1 }, { unique: true });
HelperProfileSchema.index({ status: 1, verification_status: 1 });
HelperProfileSchema.index({ service_ids: 1 });
HelperProfileSchema.index({ rating: -1 });

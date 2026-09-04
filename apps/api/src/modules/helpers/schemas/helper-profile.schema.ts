import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HelperStatus, VerificationStatus } from '@homemate/types';

export type HelperProfileDocument = HelperProfile & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
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

  @Prop()
  last_location_update?: Date;

  @Prop({ type: String, enum: HelperStatus, default: HelperStatus.OFFLINE, index: true })
  status: HelperStatus;

  @Prop({ type: String, enum: VerificationStatus, default: VerificationStatus.UNSUBMITTED, index: true })
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

  // Stats
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

  @Prop({ default: 0 })
  typical_warranty_days: number;

  @Prop({
    type: { bank_name: String, account_number: String, account_name: String },
  })
  bank_account?: { bank_name: string; account_number: string; account_name: string };

  created_at: Date;
  updated_at: Date;
}

export const HelperProfileSchema = SchemaFactory.createForClass(HelperProfile);
HelperProfileSchema.index({ location: '2dsphere' }, { sparse: true });
HelperProfileSchema.index({ user_id: 1 }, { unique: true });
HelperProfileSchema.index({ status: 1, verification_status: 1 });
HelperProfileSchema.index({ service_ids: 1 });
HelperProfileSchema.index({ working_areas: 1 });
HelperProfileSchema.index({ rating: -1 });
HelperProfileSchema.index({ completion_rate: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomerProfileDocument = CustomerProfile & Document;

const AddressSchema = {
  label: { type: String, required: true },
  full_address: { type: String, required: true },
  street: { type: String },
  ward: { type: String },
  district: { type: String, required: true },
  city: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  is_default: { type: Boolean, default: false },
  notes: { type: String },
};

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class CustomerProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: [AddressSchema], default: [] })
  addresses: {
    label: string;
    full_address: string;
    street?: string;
    ward?: string;
    district: string;
    city: string;
    location: { type: 'Point'; coordinates: [number, number] };
    is_default: boolean;
    notes?: string;
  }[];

  @Prop()
  preferred_payment_method?: string;

  @Prop({ default: 0 })
  total_jobs: number;

  @Prop({ default: 0 })
  completed_jobs: number;

  @Prop({ default: 0 })
  cancelled_jobs: number;

  @Prop({ default: 0 })
  total_spent: number;

  created_at: Date;
  updated_at: Date;
}

export const CustomerProfileSchema = SchemaFactory.createForClass(CustomerProfile);
CustomerProfileSchema.index({ 'addresses.location': '2dsphere' });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BookingStatus, PaymentStatus } from '@homemate/types';

export type BookingDocument = Booking & Document;

const AddressSchema = {
  full_address: { type: String, required: true },
  district: { type: String, required: true },
  city: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  notes: { type: String },
};

const PriceBreakdownSchema = {
  base_price: { type: Number, default: 0 },
  hourly_rate: { type: Number, default: 0 },
  duration_hours: { type: Number, default: 0 },
  extra_fees: { type: Number, default: 0 },
  platform_fee: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
};

const BookingEventSchema = {
  status: { type: String, enum: BookingStatus, required: true },
  note: { type: String },
  actor_id: { type: Types.ObjectId, required: true },
  actor_role: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
};

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: '__v' })
export class Booking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  helper_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Service', required: true })
  service_id: Types.ObjectId;

  @Prop({ type: String, enum: BookingStatus, default: BookingStatus.DRAFT, index: true })
  status: BookingStatus;

  @Prop({ type: AddressSchema, required: true })
  address: {
    full_address: string;
    district: string;
    city: string;
    location: { type: 'Point'; coordinates: [number, number] };
    notes?: string;
  };

  @Prop({ required: true })
  scheduled_at: Date;

  @Prop({ required: true, min: 1, max: 12 })
  duration_hours: number;

  @Prop()
  description?: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: PriceBreakdownSchema })
  price_breakdown: {
    base_price: number;
    hourly_rate: number;
    duration_hours: number;
    extra_fees: number;
    platform_fee: number;
    tax: number;
  };

  @Prop({ default: 0 })
  total_price: number;

  @Prop()
  promotion_code?: string;

  @Prop({ default: 0 })
  discount_amount: number;

  @Prop({ default: 0 })
  final_price: number;

  @Prop()
  payment_method?: string;

  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.UNPAID })
  payment_status: PaymentStatus;

  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop()
  review?: string;

  @Prop({ type: [BookingEventSchema], default: [] })
  events: {
    status: BookingStatus;
    note?: string;
    actor_id: Types.ObjectId;
    actor_role: string;
    timestamp: Date;
  }[];

  @Prop()
  cancellation_reason?: string;

  @Prop({ type: Types.ObjectId })
  cancelled_by?: Types.ObjectId;

  created_at: Date;
  updated_at: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

// Indexes
BookingSchema.index({ customer_id: 1, status: 1 });
BookingSchema.index({ helper_id: 1, status: 1 });
BookingSchema.index({ scheduled_at: 1 });
BookingSchema.index({ created_at: -1 });
BookingSchema.index({ status: 1, scheduled_at: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FavoriteHelperDocument = FavoriteHelper & Document;

// ─── Favorite Helper (Thợ yêu thích của khách hàng) ────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class FavoriteHelper {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  helper_id: Types.ObjectId;

  created_at: Date;
  updated_at: Date;
}

export const FavoriteHelperSchema = SchemaFactory.createForClass(FavoriteHelper);
FavoriteHelperSchema.index({ customer_id: 1, helper_id: 1 }, { unique: true });

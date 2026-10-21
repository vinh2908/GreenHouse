import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportConversationDocument = SupportConversation & Document;
export type SupportMessageDocument = SupportMessage & Document;
export type SupportConversationStatus = 'open' | 'closed';

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class SupportConversation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, enum: ['open', 'closed'], default: 'open' })
  status: SupportConversationStatus;

  @Prop()
  last_message?: string;

  @Prop()
  last_message_at?: Date;

  @Prop({ default: 0 })
  unread_for_admin: number;

  @Prop({ default: 0 })
  unread_for_user: number;

  created_at: Date;
  updated_at: Date;
}

export const SupportConversationSchema = SchemaFactory.createForClass(SupportConversation);
SupportConversationSchema.index({ user_id: 1, created_at: -1 });
SupportConversationSchema.index({ last_message_at: -1 });

@Schema({ timestamps: { createdAt: 'created_at' }, versionKey: false })
export class SupportMessage {
  @Prop({ type: Types.ObjectId, ref: 'SupportConversation', required: true, index: true })
  conversation_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender_id: Types.ObjectId;

  @Prop({ type: String, enum: ['user', 'admin'], required: true })
  sender_role: 'user' | 'admin';

  @Prop({ required: true })
  content: string;

  @Prop({ default: 'text' })
  type: string;

  created_at: Date;
}

export const SupportMessageSchema = SchemaFactory.createForClass(SupportMessage);
SupportMessageSchema.index({ conversation_id: 1, created_at: -1 });

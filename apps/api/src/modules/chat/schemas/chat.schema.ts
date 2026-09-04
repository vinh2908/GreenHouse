import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;
export type MessageDocument = Message & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Conversation {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, unique: true })
  job_id: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'User', required: true })
  participants: Types.ObjectId[];

  @Prop()
  last_message?: string;

  @Prop()
  last_message_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ job_id: 1 }, { unique: true });
ConversationSchema.index({ participants: 1 });

@Schema({ timestamps: { createdAt: 'created_at' }, versionKey: false })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversation_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender_id: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ default: 'text' })
  type: string; // 'text' | 'image' | 'system'

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  read_by: Types.ObjectId[];

  created_at: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversation_id: 1, created_at: -1 });
MessageSchema.index({ sender_id: 1 });

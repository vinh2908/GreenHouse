import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallSessionDocument = CallSession & Document;

/**
 * Phiên gọi thoại trong app (che số thật). Chỉ lưu định danh nội bộ của 2 bên
 * theo job — không lưu số điện thoại. `provider_room_id` là phòng gọi ổn định
 * theo job để 2 phía join cùng một cuộc gọi.
 */
@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class CallSession {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  caller_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  callee_id: Types.ObjectId;

  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  provider_room_id: string;

  @Prop({
    type: String,
    enum: ['initiated', 'ringing', 'connected', 'ended', 'missed', 'failed'],
    default: 'initiated',
    index: true,
  })
  status: string;

  @Prop()
  started_at?: Date;

  @Prop()
  ended_at?: Date;

  @Prop()
  end_reason?: string;

  created_at: Date;
  updated_at: Date;
}

export const CallSessionSchema = SchemaFactory.createForClass(CallSession);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole, UserStatus } from '@homemate/types';

export type UserDocument = User & Document;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
  collection: 'users',
})
export class User {
  @Prop({ required: true, unique: true, trim: true, index: true })
  phone: string;

  @Prop({ sparse: true, lowercase: true, trim: true, index: true })
  email?: string;

  @Prop({ required: true, trim: true })
  full_name: string;

  @Prop()
  avatar?: string;

  @Prop({ type: String, enum: ['male', 'female', 'other'] })
  gender?: 'male' | 'female' | 'other';

  @Prop({ required: true, select: false }) // never return in queries
  password_hash: string;

  @Prop({ type: [String], enum: UserRole, default: [UserRole.CUSTOMER] })
  roles: UserRole[];

  @Prop({ type: String, enum: UserRole, default: UserRole.CUSTOMER })
  active_role: UserRole;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.ACTIVE, index: true })
  status: UserStatus;

  @Prop()
  suspension_reason?: string;

  @Prop()
  suspended_at?: Date;

  @Prop({ default: false })
  is_verified: boolean;

  @Prop({ select: false })
  fcm_token?: string;

  // Expo push tokens (mỗi thiết bị 1 token) — dùng để gửi OS push notification
  // qua Expo Push Service khi app không chạy. Không trả ra ngoài qua toJSON.
  @Prop({ type: [String], default: [] })
  push_tokens: string[];

  // VoIP tokens để đánh thức cuộc gọi đến khi app chạy nền / bị đóng hẳn
  // (CallKeep): iOS = PushKit token (gửi qua APNs VoIP), Android = FCM token
  // (gửi FCM high-priority). Kèm platform để API chọn đúng kênh gửi.
  // Không trả ra ngoài qua toJSON.
  @Prop({
    type: [
      {
        token: { type: String, required: true },
        platform: { type: String, enum: ['ios', 'android'], required: true },
        updated_at: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  voip_tokens: { token: string; platform: 'ios' | 'android'; updated_at: Date }[];

  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ default: 0 })
  token_version?: number;

  created_at: Date;
  updated_at: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// ToJSON — strip sensitive fields
UserSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    delete ret['password_hash'];
    delete ret['fcm_token'];
    delete ret['push_tokens'];
    delete ret['voip_tokens'];
    delete ret['__v'];
    return ret;
  },
});

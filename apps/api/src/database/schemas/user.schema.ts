import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole, UserStatus } from '@homemate/types';

export type UserDocument = User & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class User {
  @Prop({ required: true, unique: true, index: true })
  phone: string;

  @Prop({ sparse: true, index: true })
  email?: string;

  @Prop({ required: true })
  full_name: string;

  @Prop()
  avatar?: string;

  @Prop({ required: true })
  password_hash: string;

  @Prop({ type: [String], enum: UserRole, default: [UserRole.CUSTOMER] })
  roles: UserRole[];

  @Prop({ type: String, enum: UserRole, default: UserRole.CUSTOMER })
  active_role: UserRole;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ default: false })
  is_verified: boolean;

  @Prop()
  fcm_token?: string;

  @Prop({ default: false })
  is_deleted: boolean;

  created_at: Date;
  updated_at: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ status: 1 });
UserSchema.index({ roles: 1 });

// Exclude password from default JSON output
UserSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    delete ret['password_hash'];
    return ret;
  },
});

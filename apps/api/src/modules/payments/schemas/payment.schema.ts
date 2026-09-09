import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;
export type TransactionDocument = Transaction & Document;
export type WithdrawalDocument = Withdrawal & Document;

// ─── Wallet ───────────────────────────────────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: '__v' })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  user_id: Types.ObjectId;

  @Prop({ default: 0, min: 0 })
  balance: number; // VND

  @Prop({ default: 0 })
  total_earned: number;

  @Prop({ default: 0 })
  total_withdrawn: number;

  @Prop({ default: 'VND' })
  currency: string;

  created_at: Date;
  updated_at: Date;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
WalletSchema.index({ user_id: 1 }, { unique: true });

// ─── Transaction ──────────────────────────────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at' }, versionKey: false })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  wallet_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Job' })
  job_id?: Types.ObjectId;

  @Prop({ required: true })
  type: string; // 'payment' | 'earning' | 'withdrawal' | 'refund'

  @Prop({ required: true })
  status: string; // 'pending' | 'success' | 'failed'

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 0 })
  balance_before: number;

  @Prop({ default: 0 })
  balance_after: number;

  @Prop({ required: true })
  description: string;

  @Prop()
  reference?: string; // payment gateway reference

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  created_at: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ user_id: 1, created_at: -1 });
TransactionSchema.index({ wallet_id: 1 });
TransactionSchema.index({ job_id: 1 });

// ─── Withdrawal ───────────────────────────────────────────────────────────────

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Withdrawal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_id: Types.ObjectId;

  @Prop({ required: true, min: 50000 }) // Min 50k VND
  amount: number;

  @Prop({ required: true })
  status: string; // 'pending' | 'processing' | 'completed' | 'rejected'

  @Prop({ required: true, type: Object })
  bank_account: {
    bank_name: string;
    account_number: string;
    account_name: string;
  };

  @Prop()
  admin_note?: string;

  @Prop()
  processed_at?: Date;

  @Prop()
  processed_by?: string;

  created_at: Date;
  updated_at: Date;
}

export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal);
WithdrawalSchema.index({ user_id: 1, status: 1 });
WithdrawalSchema.index({ status: 1, created_at: -1 });

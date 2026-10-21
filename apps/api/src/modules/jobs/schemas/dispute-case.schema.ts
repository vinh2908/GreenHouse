import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DisputeCaseDocument = DisputeCase & Document;

export type DisputeCaseStatus = 'open' | 'resolved' | 'appealed';

export type DisputeTimelineKind =
  | 'opened' // Mở tranh chấp
  | 'evidence' // Bổ sung bằng chứng (ảnh)
  | 'note' // Ghi chú / trình bày thêm
  | 'admin_message' // Admin nhắn trong hồ sơ
  | 'resolution' // Admin ra phán quyết
  | 'appeal' // Một bên kháng cáo
  | 'appeal_resolved'; // Phán quyết sau kháng cáo

const TimelineEntrySchema = {
  kind: {
    type: String,
    enum: ['opened', 'evidence', 'note', 'admin_message', 'resolution', 'appeal', 'appeal_resolved'],
    required: true,
  },
  actor_id: { type: Types.ObjectId, ref: 'User', required: true },
  actor_role: { type: String, required: true }, // 'customer' | 'helper' | 'admin' | 'system'
  text: { type: String },
  photos: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now },
};

const ResolutionSnapshotSchema = {
  action: { type: String, enum: ['refund_full', 'refund_partial', 'release_to_helper'] },
  refund_amount: { type: Number, default: 0 },
  helper_payout: { type: Number, default: 0 },
  admin_note: { type: String },
  resolved_by: { type: Types.ObjectId, ref: 'User' },
  resolved_at: { type: Date },
};

const AppealSchema = {
  by: { type: Types.ObjectId, ref: 'User', required: true },
  by_role: { type: String, required: true },
  reason: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
};

// ─── Dispute Case (Hồ sơ tranh chấp) ──────────────────────────────────────────
// Mở rộng từ các field dispute_* sẵn có trên Job: timeline đầy đủ cho 2 bên +
// admin, bổ sung bằng chứng sau khi mở, và kháng cáo 1 lần sau phán quyết.

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class DisputeCase {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, unique: true, index: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  helper_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  opened_by: Types.ObjectId;

  @Prop({ required: true })
  opened_by_role: string;

  @Prop({ type: String, enum: ['open', 'resolved', 'appealed'], default: 'open', index: true })
  status: DisputeCaseStatus;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: [TimelineEntrySchema], default: [] })
  timeline: {
    kind: DisputeTimelineKind;
    actor_id: Types.ObjectId;
    actor_role: string;
    text?: string;
    photos: string[];
    created_at: Date;
  }[];

  @Prop({ type: ResolutionSnapshotSchema })
  resolution?: {
    action: 'refund_full' | 'refund_partial' | 'release_to_helper';
    refund_amount?: number;
    helper_payout?: number;
    admin_note?: string;
    resolved_by?: Types.ObjectId;
    resolved_at?: Date;
  };

  @Prop()
  resolved_at?: Date;

  /** Hạn cuối được kháng cáo (tính khi admin ra phán quyết) */
  @Prop()
  appeal_deadline?: Date;

  @Prop({ type: AppealSchema })
  appeal?: {
    by: Types.ObjectId;
    by_role: string;
    reason: string;
    created_at: Date;
  };

  created_at: Date;
  updated_at: Date;
}

export const DisputeCaseSchema = SchemaFactory.createForClass(DisputeCase);
DisputeCaseSchema.index({ customer_id: 1, status: 1 });
DisputeCaseSchema.index({ helper_id: 1, status: 1 });

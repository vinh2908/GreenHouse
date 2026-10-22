import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SosBackupRequestDocument = SosBackupRequest & Document;

// ─── Lý do thợ không thể tiếp tục đơn (chỉ gửi MÃ lý do cho khách — không chi tiết riêng tư) ──
export enum SosBackupReason {
  PERSONAL_EMERGENCY = 'personal_emergency', // Việc cá nhân khẩn cấp
  ACCIDENT = 'accident', // Tai nạn
  VEHICLE_BREAKDOWN = 'vehicle_breakdown', // Xe hỏng / sự cố phương tiện
  FAMILY_EMERGENCY = 'family_emergency', // Việc gia đình khẩn cấp
  OTHER = 'other', // Lý do khác
}

// ─── Vòng đời yêu cầu SOS Backup ──────────────────────────────────────────────
// awaiting_customer → (khách đồng ý) → pending → accepted
//                   → (khách hủy đơn) → customer_cancelled
//                   → (khách không phản hồi quá hạn) → decision_timeout (mặc định: hủy đơn + hoàn tiền)
// awaiting_customer / pending → (thợ gốc thu hồi) → cancelled
// pending → (hết hạn phát sóng, không ai nhận) → expired (gắn cờ admin xử lý thủ công)
export enum SosBackupStatus {
  AWAITING_CUSTOMER = 'awaiting_customer',
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  CUSTOMER_CANCELLED = 'customer_cancelled',
  DECISION_TIMEOUT = 'decision_timeout',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum SosBackupDecision {
  ACCEPT_REPLACEMENT = 'accept_replacement',
  CANCEL_JOB = 'cancel_job',
}

export type SosCandidateState = 'ranked' | 'invited' | 'declined' | 'accepted' | 'resolved';

const SosCandidateSchema = {
  helper_id: { type: Types.ObjectId, ref: 'User', required: true },
  /** Chi phí ghép theo mô hình Hungarian (càng thấp càng tốt) */
  cost: { type: Number, required: true },
  distance_km: { type: Number, required: true },
  /** Điểm phạt hủy đơn hiện tại của ứng viên (đã tính vào cost — xem helper-score.ts) */
  penalty_points: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  completed_jobs: { type: Number, default: 0 },
  active_jobs: { type: Number, default: 0 },
  /** Thợ này là ghép tối ưu toàn cục (Hungarian) cho đơn SOS này ở lần tính gần nhất */
  is_optimal_pick: { type: Boolean, default: false },
  /** Đợt (wave) đã mời; 0 = chưa được mời */
  wave: { type: Number, default: 0 },
  state: {
    type: String,
    enum: ['ranked', 'invited', 'declined', 'accepted', 'resolved'],
    default: 'ranked',
  },
  invited_at: { type: Date },
  responded_at: { type: Date },
};

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class SosBackupRequest {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  original_helper_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Service', required: true })
  service_id: Types.ObjectId;

  @Prop({ type: String, enum: SosBackupReason, required: true })
  reason: SosBackupReason;

  @Prop({ maxlength: 300 })
  reason_note?: string; // Ghi chú riêng của thợ — KHÔNG hiển thị cho khách

  @Prop({
    type: String,
    enum: SosBackupStatus,
    default: SosBackupStatus.AWAITING_CUSTOMER,
    index: true,
  })
  status: SosBackupStatus;

  // ── Cổng đồng ý của khách ──────────────────────────────────────────────────
  @Prop()
  decision_deadline?: Date; // Hạn khách phải quyết định (mặc định 5 phút từ lúc tạo)

  @Prop({ default: false })
  decision_reminder_sent: boolean;

  @Prop({ type: String, enum: SosBackupDecision })
  customer_decision?: SosBackupDecision;

  @Prop({ type: String, enum: ['customer', 'timeout_default'] })
  decided_by?: 'customer' | 'timeout_default';

  @Prop()
  decided_at?: Date;

  // ── Snapshot hiển thị (bất biến tại thời điểm tạo, dùng cho popup/thông báo) ──
  @Prop({ required: true })
  job_title: string;

  @Prop()
  service_name?: string;

  @Prop()
  district?: string;

  @Prop()
  city?: string;

  /** Số tiền thợ thay thế sẽ thực nhận (helper_receives của hợp đồng) — giá không đổi khi thay thợ */
  @Prop()
  helper_payout?: number;

  // ── Phát sóng tìm người thay (chỉ sau khi khách đồng ý) ────────────────────
  @Prop({ type: [SosCandidateSchema], default: [] })
  candidates: {
    helper_id: Types.ObjectId;
    cost: number;
    distance_km: number;
    penalty_points: number;
    rating: number;
    completed_jobs: number;
    active_jobs: number;
    is_optimal_pick: boolean;
    wave: number;
    state: SosCandidateState;
    invited_at?: Date;
    responded_at?: Date;
  }[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  optimal_helper_id?: Types.ObjectId;

  @Prop({ default: 0 })
  current_wave: number;

  @Prop()
  wave_started_at?: Date;

  @Prop()
  expires_at?: Date; // Hạn của giai đoạn phát sóng (mặc định ~4 phút từ khi bắt đầu phát)

  // ── Kết quả ────────────────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User' })
  replacement_helper_id?: Types.ObjectId;

  @Prop()
  resolved_at?: Date;

  /** Thợ gốc đã được giải phóng và KHÔNG bị tính phạt (late-cancel / risk) */
  @Prop({ default: false })
  original_helper_released: boolean;

  /** Số tiền đã hoàn vào ví khách khi hủy đơn theo chính sách SOS (0 nếu chưa/không hoàn) */
  @Prop({ default: 0 })
  refund_amount: number;

  @Prop({ default: false, index: true })
  admin_attention: boolean;

  @Prop()
  admin_note?: string;

  created_at: Date;
  updated_at: Date;
}

export const SosBackupRequestSchema = SchemaFactory.createForClass(SosBackupRequest);

// Tối đa 1 yêu cầu SOS đang hoạt động cho mỗi đơn (chống race khi thợ bấm 2 lần / 2 thiết bị)
SosBackupRequestSchema.index(
  { job_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [SosBackupStatus.AWAITING_CUSTOMER, SosBackupStatus.PENDING] },
    },
  },
);
SosBackupRequestSchema.index({ status: 1, decision_deadline: 1 });
SosBackupRequestSchema.index({ status: 1, expires_at: 1 });
SosBackupRequestSchema.index({ 'candidates.helper_id': 1, status: 1 });

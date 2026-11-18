// ─── Job Status State Machine (Vua Thợ model) ────────────────────────────────
//
// Flow: Customer đăng job → Helpers gửi báo giá → Customer chọn → Hợp đồng số
//       → Helper làm việc → Nghiệm thu → Thanh toán → Đánh giá

export enum JobStatus {
  DRAFT = 'draft', // Customer đang soạn yêu cầu
  OPEN = 'open', // Đã đăng, đang nhận báo giá từ helpers
  RECEIVING_QUOTES = 'receiving_quotes', // Đang có báo giá, vẫn nhận thêm
  QUOTE_SELECTED = 'quote_selected', // Customer đã chọn 1 báo giá
  CONFIRMED = 'confirmed', // Helper xác nhận, hợp đồng số đã tạo
  HELPER_ON_THE_WAY = 'helper_on_the_way',
  HELPER_ARRIVED = 'helper_arrived',
  IN_PROGRESS = 'in_progress',
  PENDING_REVIEW = 'pending_review', // Helper upload ảnh hoàn thành, chờ customer nghiệm thu
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  DISPUTED = 'disputed',
  REFUNDED = 'refunded',
}

// Valid state transitions
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.DRAFT]: [JobStatus.OPEN, JobStatus.CANCELLED],
  [JobStatus.OPEN]: [
    JobStatus.RECEIVING_QUOTES,
    JobStatus.CONFIRMED,
    JobStatus.CANCELLED,
    JobStatus.EXPIRED,
  ],
  [JobStatus.RECEIVING_QUOTES]: [
    JobStatus.QUOTE_SELECTED,
    JobStatus.CONFIRMED,
    JobStatus.CANCELLED,
    JobStatus.EXPIRED,
  ],
  [JobStatus.QUOTE_SELECTED]: [
    JobStatus.CONFIRMED,
    JobStatus.RECEIVING_QUOTES,
    JobStatus.CANCELLED,
    JobStatus.EXPIRED,
  ],
  [JobStatus.CONFIRMED]: [JobStatus.HELPER_ON_THE_WAY, JobStatus.CANCELLED],
  [JobStatus.HELPER_ON_THE_WAY]: [JobStatus.HELPER_ARRIVED, JobStatus.CANCELLED],
  [JobStatus.HELPER_ARRIVED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [JobStatus.PENDING_REVIEW, JobStatus.DISPUTED],
  [JobStatus.PENDING_REVIEW]: [JobStatus.COMPLETED, JobStatus.DISPUTED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: [JobStatus.REFUNDED],
  [JobStatus.EXPIRED]: [JobStatus.OPEN], // Repost
  [JobStatus.DISPUTED]: [JobStatus.COMPLETED, JobStatus.REFUNDED],
  [JobStatus.REFUNDED]: [],
};

export function isValidJobTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Quote Status ─────────────────────────────────────────────────────────────

export enum QuoteStatus {
  PENDING = 'pending', // Đang chờ customer xem xét
  ACCEPTED = 'accepted', // Customer chọn quote này
  REJECTED = 'rejected', // Customer bỏ qua
  EXPIRED = 'expired', // Hết hạn (job đã hủy hoặc quá lâu)
  WITHDRAWN = 'withdrawn', // Helper tự rút báo giá
}

// ─── Contract Status ──────────────────────────────────────────────────────────

export enum ContractStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
}

// ─── Job (Booking) Types ──────────────────────────────────────────────────────

export interface IJob {
  _id: string;
  customer_id: string;
  service_id?: string;
  custom_service_name?: string;
  target_price?: number;
  status: JobStatus;

  // Mô tả yêu cầu
  title: string;
  description: string;
  photos: string[]; // Ảnh hiện trạng (customer upload)
  videos?: string[]; // Video hiện trạng

  // Địa chỉ
  address: IJobAddress;

  // Thời gian mong muốn
  preferred_date?: Date;
  preferred_time_start?: string; // "08:00"
  preferred_time_end?: string; // "12:00"
  is_flexible_time: boolean;

  // AI giá gợi ý
  ai_price_suggestion?: {
    min: number;
    max: number;
    estimated_duration?: number; // hours
    confidence?: number; // 0-1
  };

  // Báo giá
  quotes: IQuote[];
  selected_quote_id?: string;
  total_quotes_count: number;

  // ── R10: các trường runtime trên Job schema (apps/api/.../job.schema.ts) ──
  // Chỉ có trên payload đơn đầy đủ; các endpoint list có thể select thiếu nên
  // để optional — KHÔNG được đọc như thể luôn có mặt.
  estimated_duration?: number; // Giờ ước tính (snapshot lúc tạo đơn)

  // SOS khẩn cấp (đơn SOS thường)
  is_sos?: boolean;
  sos_category?: string; // 'electric' | 'plumbing' | 'lock' | 'ac_gas'
  sos_surcharge?: number; // Phụ phí SOS (VNĐ)
  sos_eta_minutes?: number;

  // Giá cam kết / Fixed price (Feature 7): đơn không nhận báo giá
  is_fixed_price?: boolean;
  fixed_price?: number; // Giá cam kết (VNĐ), snapshot từ service.fixed_price

  // Đơn bảo hành 1 chạm (Feature 9): miễn phí, giao đúng thợ đơn gốc
  is_warranty?: boolean;
  warranty_source_job_id?: string;

  // Private offer cho thợ yêu thích
  private_offer_helper_id?: string;
  private_offer_expires_at?: Date;

  // Đơn sinh từ gói định kỳ
  recurring_plan_id?: string;
  occurrence_date?: string; // 'YYYY-MM-DD'

  // GPS lúc giao việc (không phải địa chỉ làm việc thợ tự ghim)
  live_helper_location?: {
    lat: number;
    lng: number;
    accuracy?: number;
    recorded_at: number;
    helper_id: string;
  };

  // SOS Backup: vết lần thay thợ gần nhất (giá + tiền đã trả KHÔNG đổi)
  sos_backup_replacement?: {
    sos_request_id: string;
    previous_helper_id: string;
    new_helper_id: string;
    reason?: string;
    replaced_at: Date;
  };
  sos_backup_count?: number;

  // Voucher + Loyalty (Feature 12)
  voucher_code?: string;
  discount_amount?: number; // Số tiền đã giảm chính thức (khi thanh toán)
  loyalty_points_requested?: number; // Điểm khách muốn đổi (snapshot ý định)
  loyalty_discount_amount?: number; // Số tiền giảm tương ứng
  benefits_restored_at?: Date; // Đã khôi phục voucher + điểm khi hủy theo SOS

  // Đơn nhóm / Team jobs (Feature 5)
  helpers_needed?: number; // 1 = đơn thường
  team?: {
    helper_id: string;
    role: 'lead' | 'member';
    status: 'invited' | 'accepted' | 'declined';
    split_percent: number;
    invited_at?: Date;
    responded_at?: Date;
  }[];

  // Hợp đồng số (sau khi chọn báo giá)
  contract?: IContract;

  // Thực thi
  helper_id?: string; // Helper được chọn

  // Thanh toán
  payment_status: PaymentStatus;
  payment_method?: string;
  paid_amount?: number; // Tổng đã trả (VNĐ)
  cash_commission_deducted?: boolean;

  // Kết quả
  completion_photos?: string[]; // Ảnh sau khi làm xong (helper upload)
  completion_videos?: string[]; // Video sau khi làm xong (helper upload)
  completion_notes?: string; // Ghi chú hoàn thành từ thợ
  customer_rating?: number;
  customer_review?: string;
  helper_rating?: number; // Customer đánh giá helper
  helper_review?: string;
  completed_at?: Date;
  reminders_sent?: string[];
  review_reminder_sent?: boolean;

  // Audit trail
  events: IJobEvent[];
  cancellation_reason?: string;
  cancelled_by?: string;
  cancelled_by_role?: string; // 'customer' | 'helper' | 'admin' (F15)

  // Khiếu nại / tranh chấp
  dispute_reason?: string;
  dispute_photos?: string[];
  dispute_opened_by?: string;
  dispute_opened_at?: Date;
  dispute_resolution?: {
    action: 'refund_full' | 'refund_partial' | 'release_to_helper' | 'reject_dispute';
    refund_amount?: number;
    helper_payout?: number;
    admin_note?: string;
    resolved_by?: string;
    resolved_at?: Date;
  };

  // Hết hạn / nhắc nhở / watchdog
  rejected_helper_ids?: string[];
  expiry_reminder_sent?: boolean;
  last_rebroadcast_at?: Date;
  overdue_notified_for?: string; // Khóa "YYYY-MM-DDTHH:MM" đã nhắc chưa có thợ
  at_risk_flags?: string[];
  at_risk_detected_at?: Date;
  private_offer_expiry_notified?: boolean;

  // Hoàn tiền (R7/F7)
  refund_pending_retry?: boolean;
  refund_retry_count?: number;
  refund_pending_amount?: number;
  refund_pending_reason?: string;
  refunded_amount?: number; // Tổng đã hoàn cho đơn (chống hoàn vượt netPaid)

  // R10 (B10): tiền mặt chỉ được duyệt khi THỢ xác nhận đã nhận đủ tiền
  helper_cash_confirmed?: boolean;
  helper_cash_confirmed_at?: Date;

  // Expiry
  expires_at?: Date; // Job tự đóng nhận báo giá sau X giờ

  created_at: Date;
  updated_at: Date;
}

export interface IJobAddress {
  full_address: string;
  street?: string;
  ward?: string;
  district: string;
  city: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  notes?: string;
}

// ─── Quote ────────────────────────────────────────────────────────────────────

export interface IQuote {
  _id: string;
  job_id: string;
  helper_id: string;
  status: QuoteStatus;

  // Báo giá chi tiết
  labor_cost: number; // Tiền công
  materials_cost: number; // Tiền vật tư (nếu có)
  total_price: number; // labor_cost + materials_cost
  platform_fee: number; // Platform thu (%)
  helper_receives: number; // Helper nhận được sau platform fee

  // Chi tiết công việc
  estimated_duration: number; // Giờ dự kiến
  warranty_days: number; // Ngày bảo hành (0 = không bảo hành)
  notes?: string; // Ghi chú thêm của helper
  materials_breakdown?: {
    // Chi tiết vật tư
    name: string;
    quantity: number;
    unit_price: number;
  }[];

  // Timing
  available_date?: Date;
  available_time_start?: string;
  available_time_end?: string;

  expires_at: Date; // Báo giá hết hạn
  created_at: Date;
  updated_at: Date;
}

// ─── Digital Contract (Hợp đồng số) ──────────────────────────────────────────

export interface IContract {
  _id: string;
  job_id: string;
  quote_id: string;
  customer_id: string;
  helper_id: string;
  status: ContractStatus;

  // Điều khoản chốt
  labor_cost: number;
  materials_cost: number;
  total_price: number;
  platform_fee: number;
  helper_receives: number;
  warranty_days: number;

  // Lịch hẹn
  scheduled_at: Date;

  // Evidence
  before_photos: string[];
  after_photos: string[];

  // Amendments (thay đổi hợp đồng cần 2 bên đồng ý)
  amendments: IContractAmendment[];

  signed_by_customer_at?: Date;
  signed_by_helper_at?: Date;
  completed_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export interface IContractAmendment {
  _id: string;
  proposed_by: string; // customer_id hoặc helper_id
  proposed_role: string; // 'customer' | 'helper'
  changes: Partial<IContract>;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: Date;
}

// ─── Job Event (Audit Trail) ──────────────────────────────────────────────────

export interface IJobEvent {
  status: JobStatus;
  note?: string;
  actor_id: string;
  actor_role: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ─── Payment Types ────────────────────────────────────────────────────────────

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PROCESSING = 'processing',
  PAID = 'paid',
  REFUNDING = 'refunding',
  REFUNDED = 'refunded',
}

// ─── Backward compat alias ────────────────────────────────────────────────────
// Giữ lại để không break các file đã import BookingStatus
export { JobStatus as BookingStatus };
export { JOB_STATUS_TRANSITIONS as BOOKING_STATUS_TRANSITIONS };
export { isValidJobTransition as isValidTransition };

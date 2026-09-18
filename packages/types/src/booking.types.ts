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
  DISPUTED = 'disputed',
  REFUNDED = 'refunded',
}

// Valid state transitions
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.DRAFT]: [JobStatus.OPEN, JobStatus.CANCELLED],
  [JobStatus.OPEN]: [JobStatus.RECEIVING_QUOTES, JobStatus.CANCELLED],
  [JobStatus.RECEIVING_QUOTES]: [JobStatus.QUOTE_SELECTED, JobStatus.CANCELLED],
  [JobStatus.QUOTE_SELECTED]: [
    JobStatus.CONFIRMED,
    JobStatus.RECEIVING_QUOTES,
    JobStatus.CANCELLED,
  ],
  [JobStatus.CONFIRMED]: [JobStatus.HELPER_ON_THE_WAY, JobStatus.CANCELLED],
  [JobStatus.HELPER_ON_THE_WAY]: [JobStatus.HELPER_ARRIVED, JobStatus.CANCELLED],
  [JobStatus.HELPER_ARRIVED]: [JobStatus.IN_PROGRESS],
  [JobStatus.IN_PROGRESS]: [JobStatus.PENDING_REVIEW, JobStatus.DISPUTED],
  [JobStatus.PENDING_REVIEW]: [JobStatus.COMPLETED, JobStatus.DISPUTED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: [JobStatus.REFUNDED],
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
  service_id: string;
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

  // Hợp đồng số (sau khi chọn báo giá)
  contract?: IContract;

  // Thực thi
  helper_id?: string; // Helper được chọn

  // Thanh toán
  payment_status: PaymentStatus;
  payment_method?: string;

  // Kết quả
  completion_photos?: string[]; // Ảnh sau khi làm xong (helper upload)
  completion_videos?: string[]; // Video sau khi làm xong (helper upload)
  completion_notes?: string; // Ghi chú hoàn thành từ thợ
  customer_rating?: number;
  customer_review?: string;
  helper_rating?: number; // Customer đánh giá helper
  helper_review?: string;

  // Audit trail
  events: IJobEvent[];
  cancellation_reason?: string;
  cancelled_by?: string;

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
  PAID = 'paid',
  REFUNDING = 'refunding',
  REFUNDED = 'refunded',
}

// ─── Backward compat alias ────────────────────────────────────────────────────
// Giữ lại để không break các file đã import BookingStatus
export { JobStatus as BookingStatus };
export { JOB_STATUS_TRANSITIONS as BOOKING_STATUS_TRANSITIONS };
export { isValidJobTransition as isValidTransition };

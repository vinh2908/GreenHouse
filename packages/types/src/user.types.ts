// ─── User Types ───────────────────────────────────────────────────────────────

export enum UserRole {
  CUSTOMER = 'customer',
  HELPER = 'helper',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
}

export interface IUser {
  _id: string;
  phone: string;
  email?: string;
  full_name: string;
  avatar?: string;
  roles: UserRole[];
  active_role: UserRole;
  status: UserStatus;
  is_verified: boolean;
  fcm_token?: string;
  created_at: Date;
  updated_at: Date;
}

// ─── Helper Types ──────────────────────────────────────────────────────────────

export enum HelperStatus {
  OFFLINE = 'offline', // Không nhận việc
  ONLINE = 'online', // Đang nhận việc, có thể thấy jobs và gửi báo giá
  BUSY = 'busy', // Đang thực hiện công việc (đã có contract active)
}

export enum VerificationStatus {
  UNSUBMITTED = 'unsubmitted', // Chưa nộp hồ sơ
  PENDING = 'pending', // Đã nộp, chờ admin duyệt
  APPROVED = 'approved', // Đã duyệt
  REJECTED = 'rejected', // Bị từ chối
  RESUBMIT = 'resubmit', // Cần nộp lại (hồ sơ không hợp lệ)
}

export interface IHelperProfile {
  _id: string;
  user_id: string;

  // Hồ sơ cá nhân
  bio?: string;
  years_experience?: number;
  skills: string[]; // ['don-dep', 'nau-an', 've-sinh-cua-so']
  service_ids: string[]; // Dịch vụ có thể làm
  working_areas: string[]; // Quận/huyện hoạt động ['quan-1', 'quan-3']

  // Vị trí realtime
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  last_location_update?: Date;

  // Trạng thái
  status: HelperStatus;
  verification_status: VerificationStatus;

  // KYC Documents
  id_card_number?: string;
  id_card_front?: string;
  id_card_back?: string;
  id_card_verified_at?: Date;
  selfie_photo?: string; // Ảnh selfie kèm CCCD
  rejection_reason?: string; // Lý do từ chối (nếu bị reject)

  // Thống kê hiệu suất
  rating: number; // 0-5, trung bình tất cả đánh giá
  total_reviews: number;
  completed_jobs: number;
  total_quotes_sent: number;
  accepted_quotes: number; // Bao nhiêu quote được customer chọn
  acceptance_rate: number; // % quote được accept (accepted_quotes / total_quotes_sent)
  completion_rate: number; // % jobs hoàn thành sau khi nhận (completed / confirmed)
  cancellation_rate: number;
  response_time_avg?: number; // Thời gian phản hồi trung bình (phút)

  // Bảo hành thường cung cấp
  typical_warranty_days: number;

  // Tài khoản ngân hàng (để rút tiền)
  bank_account?: {
    bank_name: string;
    account_number: string;
    account_name: string;
  };

  created_at: Date;
  updated_at: Date;
}

// ─── Customer Types ────────────────────────────────────────────────────────────

export interface ICustomerProfile {
  _id: string;
  user_id: string;
  addresses: IAddress[];
  preferred_payment_method?: string;
  total_jobs: number; // Tổng số job đã đặt
  completed_jobs: number; // Tổng job hoàn thành
  cancelled_jobs: number; // Tổng job bị hủy
  total_spent: number; // Tổng tiền đã chi
  created_at: Date;
  updated_at: Date;
}

export interface IAddress {
  _id?: string;
  label: string; // 'Nhà', 'Văn phòng', 'Nhà mẹ'...
  full_address: string;
  street?: string;
  ward?: string;
  district: string;
  city: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  is_default: boolean;
  notes?: string;
}

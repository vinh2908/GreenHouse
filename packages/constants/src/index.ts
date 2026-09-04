// ─── App Constants ─────────────────────────────────────────────────────────────

export const APP_NAME = 'HomeMate';
export const APP_VERSION = '1.0.0';

// ─── API ───────────────────────────────────────────────────────────────────────

export const API_PREFIX = 'api';
export const API_VERSION = 'v1';
export const API_BASE = `/${API_PREFIX}/${API_VERSION}`;

// ─── Pagination ────────────────────────────────────────────────────────────────

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

// ─── Auth ──────────────────────────────────────────────────────────────────────

export const JWT_ACCESS_EXPIRY = '15m';
export const JWT_REFRESH_EXPIRY = '7d';
export const OTP_EXPIRY_SECONDS = 300; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

export const RATE_LIMIT_TTL = 60; // seconds
export const RATE_LIMIT_MAX = 100; // requests per TTL
export const AUTH_RATE_LIMIT_MAX = 10; // stricter for auth routes

// ─── File Upload ───────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
export const MAX_JOB_PHOTOS = 10; // Customer upload ảnh hiện trạng
export const MAX_JOB_VIDEOS = 3; // Customer upload video
export const MAX_COMPLETION_PHOTOS = 10; // Helper upload ảnh sau khi hoàn thành

// ─── Geo ───────────────────────────────────────────────────────────────────────

export const DEFAULT_SEARCH_RADIUS_KM = 10; // Helpers trong vòng 10km nhận thấy job
export const MAX_SEARCH_RADIUS_KM = 30;

// ─── Quote Sorting Weights (Vua Thợ model) ────────────────────────────────────
// Dùng để sắp xếp thứ tự hiển thị quotes cho Customer

export const QUOTE_SORT_WEIGHTS = {
  rating: 0.3,
  completed_jobs: 0.2,
  completion_rate: 0.2,
  distance: 0.15,
  price: 0.15,
} as const;

// ─── Job Feed Weights (cho Helper) ────────────────────────────────────────────
// Sắp xếp jobs phù hợp để hiển thị cho Helper

export const JOB_FEED_WEIGHTS = {
  distance: 0.35,
  service_match: 0.3,
  price_range: 0.2,
  recency: 0.15,
} as const;

// ─── Job Settings ─────────────────────────────────────────────────────────────

export const JOB_QUOTE_EXPIRY_HOURS = 24; // Quote hết hạn sau 24h nếu không được chọn
export const JOB_OPEN_EXPIRY_HOURS = 72; // Job tự đóng nhận báo giá sau 72h
export const JOB_MAX_QUOTES = 20; // Tối đa 20 báo giá / 1 job
export const JOB_MIN_QUOTES_BEFORE_SELECT = 1; // Customer cần ít nhất 1 báo giá để chọn

// ─── Platform Fee (theo model Vua Thợ: 10-25% tùy ngành) ─────────────────────

export const PLATFORM_FEE_BY_SERVICE = {
  housekeeping_hourly: 0.15, // Giúp việc theo giờ: 15%
  housekeeping_daily: 0.15, // Giúp việc theo ngày: 15%
  deep_cleaning: 0.2, // Tổng vệ sinh: 20%
  housekeeping_periodic: 0.15, // Định kỳ: 15%
  cooking: 0.15, // Nấu ăn: 15%
  default: 0.15, // Default: 15%
} as const;

// ─── Warranty ─────────────────────────────────────────────────────────────────

export const DEFAULT_WARRANTY_DAYS = 0; // Mặc định không bảo hành
export const MAX_WARRANTY_DAYS = 365; // Tối đa 1 năm

// ─── Socket Events (cập nhật theo model mới) ──────────────────────────────────

export const SOCKET_EVENTS = {
  // Job
  JOB_CREATED: 'job:created', // Broadcast to nearby helpers
  JOB_STATUS_CHANGED: 'job:status_changed',
  JOB_CANCELLED: 'job:cancelled',
  JOB_EXPIRED: 'job:expired',

  // Quote
  QUOTE_RECEIVED: 'quote:received', // Customer nhận được báo giá mới
  QUOTE_ACCEPTED: 'quote:accepted', // Helper biết quote được chọn
  QUOTE_REJECTED: 'quote:rejected', // Helper biết quote bị từ chối

  // Contract
  CONTRACT_CREATED: 'contract:created',
  CONTRACT_AMENDED: 'contract:amended', // Đề xuất thay đổi hợp đồng
  CONTRACT_AMENDMENT_ACCEPTED: 'contract:amendment_accepted',

  // Helper execution
  HELPER_ON_THE_WAY: 'helper:on_the_way',
  HELPER_LOCATION_UPDATE: 'helper:location_update',
  HELPER_ARRIVED: 'helper:arrived',
  JOB_STARTED: 'job:started',
  JOB_COMPLETION_UPLOADED: 'job:completion_uploaded', // Helper upload ảnh xong
  JOB_COMPLETED: 'job:completed',

  // Chat
  CHAT_NEW_MESSAGE: 'chat:new_message',
  CHAT_MESSAGE_READ: 'chat:message_read',

  // Notification
  NOTIFICATION_NEW: 'notification:new',
} as const;

// ─── Cache Keys ────────────────────────────────────────────────────────────────

export const CACHE_KEYS = {
  OTP: (phone: string) => `otp:${phone}`,
  REFRESH_TOKEN: (userId: string) => `refresh_token:${userId}`,
  HELPER_LOCATION: (userId: string) => `helper_location:${userId}`,
  RATE_LIMIT: (ip: string, route: string) => `rate_limit:${ip}:${route}`,
  JOB_NEARBY_HELPERS: (jobId: string) => `job:nearby_helpers:${jobId}`,
  HELPER_ACTIVE_JOB: (helperId: string) => `helper:active_job:${helperId}`,
} as const;

// ─── MinIO Buckets ─────────────────────────────────────────────────────────────

export const MINIO_BUCKETS = {
  AVATARS: 'avatars',
  ID_CARDS: 'id-cards',
  JOB_PHOTOS: 'job-photos', // Customer upload ảnh hiện trạng
  JOB_VIDEOS: 'job-videos', // Customer upload video
  COMPLETION_PHOTOS: 'completion-photos', // Helper upload ảnh sau hoàn thành
} as const;

// ─── Notification Types ────────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = {
  // Customer
  NEW_QUOTE_RECEIVED: 'new_quote_received',
  JOB_CONFIRMED: 'job_confirmed',
  HELPER_ON_THE_WAY: 'helper_on_the_way',
  HELPER_ARRIVED: 'helper_arrived',
  JOB_COMPLETED: 'job_completed',
  // Helper
  NEW_JOB_NEARBY: 'new_job_nearby',
  QUOTE_ACCEPTED: 'quote_accepted',
  QUOTE_REJECTED: 'quote_rejected',
  // Common
  PAYMENT_SUCCESS: 'payment_success',
  REVIEW_RECEIVED: 'review_received',
  PROMOTION: 'promotion',
  SYSTEM: 'system',
} as const;

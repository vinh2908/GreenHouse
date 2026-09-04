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
export const MAX_BOOKING_PHOTOS = 5;

// ─── Geo ───────────────────────────────────────────────────────────────────────

export const DEFAULT_SEARCH_RADIUS_KM = 10;
export const MAX_SEARCH_RADIUS_KM = 30;

// ─── Matching Algorithm Weights ────────────────────────────────────────────────

export const MATCH_WEIGHTS = {
  distance: 0.20,
  rating: 0.20,
  experience: 0.15,
  completed_jobs: 0.15,
  skills: 0.10,
  availability: 0.10,
  acceptance_rate: 0.05,
  price: 0.05,
} as const;

// ─── Booking ───────────────────────────────────────────────────────────────────

export const BOOKING_AUTO_CANCEL_MINUTES = 30; // auto cancel if no payment
export const BOOKING_MIN_HOURS = 2;
export const BOOKING_MAX_HOURS = 8;
export const PLATFORM_FEE_PERCENT = 0.15; // 15% platform commission

// ─── Socket Events ─────────────────────────────────────────────────────────────

export const SOCKET_EVENTS = {
  // Booking
  BOOKING_CREATED: 'booking:created',
  BOOKING_STATUS_CHANGED: 'booking:status_changed',
  BOOKING_CANCELLED: 'booking:cancelled',
  // Helper
  HELPER_ASSIGNED: 'helper:assigned',
  HELPER_LOCATION_UPDATE: 'helper:location_update',
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
} as const;

// ─── MinIO Buckets ─────────────────────────────────────────────────────────────

export const MINIO_BUCKETS = {
  AVATARS: 'avatars',
  ID_CARDS: 'id-cards',
  BOOKING_PHOTOS: 'booking-photos',
  COMPLETION_PHOTOS: 'completion-photos',
} as const;

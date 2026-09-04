// ─── Service Types ─────────────────────────────────────────────────────────────

export enum ServiceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export interface IServiceCategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  status: ServiceStatus;
  sort_order: number;
  created_at: Date;
}

// Model Vua Thợ: KHÔNG có giá cố định
// Helper tự báo giá — platform chỉ cung cấp khoảng giá tham khảo
export interface IService {
  _id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  banner_image?: string;
  status: ServiceStatus;

  // Khoảng giá gợi ý (thị trường) — không phải giá cố định
  price_range_min: number; // VND
  price_range_max: number; // VND

  // Thời gian ước tính
  estimated_duration_min: number; // hours
  estimated_duration_max: number; // hours

  // Cài đặt platform
  platform_fee_percent: number;
  requires_site_visit: boolean; // Cần xem nhà trước khi báo giá chính xác
  allows_video_upload: boolean;

  // Tags & SEO
  tags: string[];
  keywords: string[];

  // Stats
  total_jobs: number;
  total_helpers: number;
  avg_rating: number;

  created_at: Date;
  updated_at: Date;
}

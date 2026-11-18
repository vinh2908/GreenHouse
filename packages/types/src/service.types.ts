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

  // Giá gốc (base) — admin sửa khoảng giá qua 2 trường này
  // (apps/admin/.../services/page.tsx ghi base_price_min/max)
  base_price_min: number; // VND
  base_price_max: number; // VND

  // Thời gian ước tính
  estimated_duration_min: number; // hours
  estimated_duration_max: number; // hours

  // Cài đặt platform
  platform_fee_percent: number;

  // Giá cam kết / Fixed price (Feature 7 — khớp Service schema):
  // 'quote' = thợ gửi báo giá như cũ; 'fixed' = giá cố định sàn công bố,
  // thợ nhận việc trực tiếp, không qua vòng báo giá.
  pricing_model: 'quote' | 'fixed';
  fixed_price: number; // Giá cam kết (VNĐ) — chỉ dùng khi pricing_model = 'fixed'

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

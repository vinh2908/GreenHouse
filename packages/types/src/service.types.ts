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

export interface IService {
  _id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  status: ServiceStatus;
  base_price: number;
  price_per_hour: number;
  min_hours: number;
  max_hours: number;
  platform_fee_percent: number;
  estimated_duration?: number;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

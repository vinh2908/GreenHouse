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
  created_at: Date;
  updated_at: Date;
}

// ─── Helper Types ──────────────────────────────────────────────────────────────

export enum HelperStatus {
  OFFLINE = 'offline',
  ONLINE = 'online',
  BUSY = 'busy',
}

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface IHelperProfile {
  _id: string;
  user_id: string;
  bio?: string;
  skills: string[];
  service_ids: string[];
  working_areas: string[];
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  status: HelperStatus;
  verification_status: VerificationStatus;
  id_card_front?: string;
  id_card_back?: string;
  rating: number;
  total_reviews: number;
  completed_jobs: number;
  acceptance_rate: number;
  cancellation_rate: number;
  hourly_rate?: number;
  created_at: Date;
  updated_at: Date;
}

// ─── Customer Types ────────────────────────────────────────────────────────────

export interface ICustomerProfile {
  _id: string;
  user_id: string;
  addresses: IAddress[];
  preferred_payment_method?: string;
  created_at: Date;
  updated_at: Date;
}

export interface IAddress {
  _id?: string;
  label: string;
  full_address: string;
  street?: string;
  district: string;
  city: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  is_default: boolean;
  notes?: string;
}

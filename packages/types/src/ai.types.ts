// ─── AI Feature Types ──────────────────────────────────────────────────────────

export interface AiBookingAnalysis {
  service_type?: string; // e.g. 'housekeeping_hourly'
  service_name?: string; // human-readable
  estimated_duration_hours?: number;
  num_workers?: number;
  tasks?: string[]; // ['dọn phòng ngủ', 'lau sàn', ...]
  price_min?: number;
  price_max?: number;
  confidence: number; // 0-1
  raw_input: string;
}

export interface AiPriceEstimate {
  service_type?: string;
  price_min: number;
  price_max: number;
  estimated_duration_hours: number;
  num_workers: number;
  complexity: 'easy' | 'medium' | 'hard';
  reasoning: string;
  tasks?: string[];
  confidence: number;
}

export interface AiMatchExplanation {
  helper_id: string;
  score: number;
  reasons: string[]; // ['Khoảng cách gần (1.2km)', 'Rating 4.8 ⭐', ...]
  strengths: string[];
  concerns?: string[];
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiSupportResponse {
  answer: string;
  intent?: string; // 'cancel_booking' | 'check_status' | 'general'
  suggested_actions?: string[];
  confidence: number;
}

// ─── Feature Flag ──────────────────────────────────────────────────────────────

export interface AiFeatureFlags {
  booking_assistant: boolean;
  price_estimator: boolean;
  match_explanation: boolean;
  customer_support: boolean;
}

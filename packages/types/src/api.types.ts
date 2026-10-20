// ─── API Response Types ────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: ApiMeta;
}

export interface ApiError {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown[];
  };
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  total_pages?: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ─── Auth Types ────────────────────────────────────────────────────────────────

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface JwtPayload {
  sub: string;
  phone: string;
  roles: string[];
  active_role: string;
  iat?: number;
  exp?: number;
}

// ─── Payment Types ─────────────────────────────────────────────────────────────

export enum TransactionType {
  PAYMENT = 'payment',
  REFUND = 'refund',
  WITHDRAWAL = 'withdrawal',
  TOP_UP = 'top_up',
  COMMISSION = 'commission',
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface IWallet {
  _id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_withdrawn: number;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface ITransaction {
  _id: string;
  wallet_id: string;
  user_id: string;
  booking_id?: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

// ─── Notification Types ────────────────────────────────────────────────────────

export enum NotificationType {
  BOOKING_CREATED = 'booking_created',
  BOOKING_STATUS_CHANGED = 'booking_status_changed',
  HELPER_ASSIGNED = 'helper_assigned',
  PAYMENT_SUCCESS = 'payment_success',
  REVIEW_RECEIVED = 'review_received',
  PROMOTION = 'promotion',
  SYSTEM = 'system',
}

export interface INotification {
  _id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: Date;
}

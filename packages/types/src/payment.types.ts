// ─── Payment Types ─────────────────────────────────────────────────────────────

// Giá trị type thực tế ghi trong Transaction (payments.service.ts):
// 'payment' (khách trả) · 'earning' (thợ nhận) · 'withdrawal' (rút tiền) ·
// 'refund' (hoàn khách) · 'commission' (hoa hồng platform).
// KHÔNG có 'top_up': nạp demo chỉ cộng Wallet.simulated_balance, không ghi
// Transaction (xem comment P0-1 trong payment.schema.ts).
export enum TransactionType {
  PAYMENT = 'payment',
  EARNING = 'earning',
  WITHDRAWAL = 'withdrawal',
  REFUND = 'refund',
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
  // Ref tới đơn (Transaction schema: job_id, ref 'Job').
  // KHÔNG có booking_id ở runtime — tên cũ đã bỏ.
  job_id?: string;
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
//
// Runtime lưu type dạng chuỗi tự do (Notification schema: type: string).
// Danh sách chuẩn nằm ở NOTIFICATION_TYPES trong @homemate/constants —
// union này mirror danh sách đó (+ các chuỗi legacy vẫn còn trong DB / vẫn
// được NotificationsService xử lý: sos_broadcast/sos_request/sos_accepted/
// sos_completed/sos_cancelled, admin_penalty, bonus, voucher).
// Enum cũ (booking_created / booking_status_changed / helper_assigned...)
// KHÔNG tồn tại ở runtime — đã bỏ.
export type NotificationType =
  | 'new_quote_received'
  | 'job_confirmed'
  | 'helper_on_the_way'
  | 'helper_arrived'
  | 'job_completed'
  | 'job_expired'
  | 'job_expiring_soon'
  | 'job_no_helper_at_start'
  | 'job_auto_cancelled'
  | 'new_job_nearby'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'quote_hidden'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'withdrawal_processed'
  | 'payment_success'
  | 'refund_received'
  | 'review_received'
  | 'loyalty_points_earned'
  | 'voucher_restored'
  | 'voucher_expiring_soon'
  | 'review_appeal'
  | 'new_message'
  | 'promotion'
  | 'support_reply'
  | 'monthly_contract_new'
  | 'monthly_contract_accepted'
  | 'monthly_contract_rejected'
  | 'monthly_contract_cancelled'
  | 'monthly_contract_ended'
  | 'monthly_contract_checkin'
  | 'monthly_contract_attendance'
  | 'monthly_contract_leave_request'
  | 'monthly_contract_leave_response'
  | 'monthly_contract_settled'
  | 'monthly_contract_started'
  | 'monthly_contract_expiring_soon'
  | 'job_private_offer'
  | 'job_private_offer_expired'
  | 'recurring_plan_paused'
  | 'recurring_plan_resumed'
  | 'recurring_plan_cancelled'
  | 'insurance_claim_update'
  | 'job_cancelled'
  | 'job_updated'
  | 'cost_proposal'
  | 'cost_proposal_response'
  | 'dispute_updated'
  | 'dispute_appealed'
  | 'team_invitation'
  | 'team_response'
  | 'recurring_job_created'
  | 'sos_backup_withdrawn'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'claim_submitted'
  | 'call_missed'
  | 'sos_backup_decision_request'
  | 'sos_backup_decision_reminder'
  | 'sos_backup_job_cancelled'
  | 'sos_backup_request'
  | 'sos_backup_helper_replaced'
  | 'sos_backup_expired'
  | 'job_created'
  | 'team_invitation_response'
  | 'dispute_evidence'
  | 'job_status_changed'
  | 'system'
  // Chuỗi legacy vẫn được xử lý / còn trong DB cũ
  | 'sos_broadcast'
  | 'sos_request'
  | 'sos_accepted'
  | 'sos_completed'
  | 'sos_cancelled'
  | 'admin_penalty'
  | 'bonus'
  | 'voucher';

export interface INotification {
  _id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: Date;
  updated_at: Date;
}

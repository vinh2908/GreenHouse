// utils/notification-route.ts — Bộ phân giải deep-link DUY NHẤT cho thông báo.
//
// Mọi thông báo — chạm trong danh sách trong app (app/notifications.tsx) hay chạm
// vào OS push (hooks/use-push-notifications.ts) — đều đi qua hàm này để tính
// "chạm vào thì mở đúng màn hình mà thông báo nói tới". Trả về null = thông báo
// không có đích cụ thể (chạm chỉ đánh dấu đã đọc).
//
// ids lấy từ data (bản ghi API) hoặc payload (socket/push data phẳng) — server
// luôn gửi payload dạng { job_id, sos_id, contract_id, ... } (xem producers ở API).

export interface NotificationRouteDescriptor {
  pathname: string;
  params?: Record<string, string>;
}

export interface NotificationLike {
  type?: string;
  data?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
}

type Role = 'customer' | 'helper' | string | null | undefined;

// Các type mà người nhận CHẮC CHẮN là THỢ (đích: màn hình thợ của đơn).
// payment_success KHÔNG nằm ở đây nữa: producer gửi cho thợ với nội dung
// "tiền công đã cộng vào ví" → đích đúng là ví/thu nhập (xem nhánh riêng dưới).
const HELPER_JOB_TYPES = new Set([
  'quote_accepted',
  'quote_rejected',
  'review_received',
  'new_job_nearby',
]);
// Các type mà người nhận CHẮC CHẮN là KHÁCH (đích: màn hình khách của đơn).
const CUSTOMER_JOB_TYPES = new Set([
  'new_quote_received',
  'job_confirmed',
  'helper_on_the_way',
  'helper_arrived',
  'job_completed',
]);

// Focus trong màn hình chi tiết đơn (khách): chạm thông báo là cuộn thẳng tới
// khu vực thao tác của thông báo đó thay vì đứng ở đầu trang dài.
// - quotes:   mục "Danh sách thợ báo giá" — nơi khách bấm "Chấp nhận thợ này".
// - tracking: bản đồ theo dõi trực tiếp — nơi khách xem thợ đang tới.
// (app/job-detail/[id].tsx đọc param `focus` và tự cuộn sau khi dữ liệu tải.)
const CUSTOMER_JOB_FOCUS: Record<string, string> = {
  new_quote_received: 'quotes',
  helper_on_the_way: 'tracking',
  helper_arrived: 'tracking',
};

const SOS_TYPES = new Set([
  'sos_backup_decision_request',
  'sos_backup_decision_reminder',
  'sos_backup_job_cancelled',
  'sos_backup_request',
  'sos_backup_helper_replaced',
  'sos_backup_expired',
]);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : v != null && typeof v !== 'object' ? String(v) : undefined;

function jobRoute(
  jobId: string,
  asHelper: boolean,
  focus?: string,
): NotificationRouteDescriptor {
  return asHelper
    ? { pathname: '/helper-job-detail/[id]', params: { id: jobId } }
    : {
        pathname: '/job-detail/[id]',
        params: focus ? { id: jobId, focus } : { id: jobId },
      };
}

/**
 * Phía của người nhận khi type KHÔNG ghim sẵn phía (thông báo 2 đầu như kết
 * quả SOS, system gắn job): ưu tiên chế độ đang mở (active_role); nếu chế độ
 * chưa rõ (web/mới đăng nhập active_role trống) thì suy từ roles của tài
 * khoản — tài khoản CHỈ có vai thợ → phía thợ; còn lại mặc định phía khách.
 */
function fallbackAsHelper(activeRole: Role, roles?: string[] | null): boolean {
  if (activeRole === 'helper') return true;
  if (activeRole === 'customer') return false;
  return !!roles && roles.includes('helper') && !roles.includes('customer');
}

/** true = mở theo phía thợ, false = phía khách (bộ type ghim phía trước, rồi mới tới suy luận). */
function asHelperFor(type: string, activeRole: Role, roles?: string[] | null): boolean {
  if (HELPER_JOB_TYPES.has(type)) return true;
  if (CUSTOMER_JOB_TYPES.has(type)) return false;
  return fallbackAsHelper(activeRole, roles);
}

export function resolveNotificationRoute(
  n: NotificationLike,
  activeRole: Role,
  roles?: string[] | null,
): NotificationRouteDescriptor | null {
  const type = n.type ?? '';
  const data: Record<string, unknown> = { ...(n.payload ?? {}), ...(n.data ?? {}) };
  const jobId = str(data.job_id);
  const contractId = str(data.contract_id);

  // ── SOS Backup: luôn về chi tiết đơn liên quan ─────────────────────────────
  if (SOS_TYPES.has(type)) {
    if (!jobId) return null;
    if (type === 'sos_backup_request') return jobRoute(jobId, true); // thợ ứng viên
    if (type === 'sos_backup_decision_request' || type === 'sos_backup_decision_reminder') {
      return jobRoute(jobId, false); // khách quyết định
    }
    // job_cancelled / helper_replaced / expired: báo cho cả 2 phía → suy phía
    // theo chế độ đang mở / roles của tài khoản (không còn mặc định cứng khách).
    return jobRoute(jobId, asHelperFor(type, activeRole, roles));
  }

  // ── Tin nhắn mới → đúng cuộc trò chuyện của đơn ────────────────────────────
  if (type === 'new_message') {
    if (jobId) return { pathname: '/chat/[jobId]', params: { jobId } };
    // Chỉ có conversation_id: màn chat mở theo job nên không vào thẳng được,
    // khách về tab Tin nhắn; thợ không có tab tin nhắn riêng → bỏ qua.
    return activeRole === 'helper' ? null : { pathname: '/(customer)/messages' };
  }

  // ── KYC ────────────────────────────────────────────────────────────────────
  if (type === 'kyc_approved' || type === 'kyc_rejected' || type.startsWith('kyc_')) {
    return { pathname: '/kyc' };
  }

  // ── Rút tiền / ví thợ ──────────────────────────────────────────────────────
  if (type === 'withdrawal_processed') {
    return { pathname: '/(helper)/earnings' };
  }

  // ── Tiền công đã vào ví (gửi cho thợ khi đơn hoàn tất/nghiệm thu) ─────────
  // Nội dung thông báo là TIỀN ĐÃ VỀ VÍ → đích đúng là màn Thu nhập, nơi thấy
  // số dư mới + dòng thu nhập của đúng đơn này trong lịch sử biến động.
  if (type === 'payment_success') {
    return { pathname: '/(helper)/earnings' };
  }

  // ── Hợp đồng tháng ────────────────────────────────────────────────────────
  if (type.startsWith('monthly_contract')) {
    if (contractId) return { pathname: '/monthly-contract/[id]', params: { id: contractId } };
    return { pathname: '/monthly-contracts' };
  }

  // ── Bồi thường bảo hiểm (màn claim mở theo job) ──────────────────────────
  if (type === 'insurance_claim_update' || type.includes('claim')) {
    if (jobId) return { pathname: '/claim/[jobId]', params: { jobId } };
    return null; // chỉ có claim_id → không đủ dữ kiện mở màn claim
  }

  // ── Tranh chấp (màn dispute mở theo job) ──────────────────────────────────
  if (type.includes('dispute') || data.dispute_id) {
    const disputeJobId = jobId ?? str(data.dispute_id);
    if (disputeJobId) return { pathname: '/dispute/[jobId]', params: { jobId: disputeJobId } };
    return null;
  }

  // ── Hỗ trợ trực tuyến ─────────────────────────────────────────────────────
  if (type === 'support_reply' || type.startsWith('support')) {
    return { pathname: '/support-chat' };
  }

  // ── Gói định kỳ / điểm thành viên / thợ yêu thích ────────────────────────
  if (type.startsWith('recurring')) return { pathname: '/recurring-plans' };
  if (type.startsWith('loyalty')) return { pathname: '/loyalty' };
  if (type.includes('favorite')) return { pathname: '/(customer)/favorites' };

  // ── Ví: nạp/rút/hoàn tiền không gắn job cụ thể (dự phòng cho type tương lai)
  if (type.includes('wallet') || type.includes('topup') || type.includes('refund')) {
    return activeRole === 'helper'
      ? { pathname: '/(helper)/earnings' }
      : { pathname: '/bank-account' };
  }

  // ── Mặc định: có job_id → chi tiết đơn theo phía của người nhận ───────────
  // Bao phủ toàn bộ vòng đời đơn (new_quote_received, quote_accepted,
  // job_confirmed, helper_on_the_way/arrived, job_completed, review_*,
  // new_job_nearby...) và các thông báo type=system gắn job (kể cả thông báo
  // tranh chấp hiện đang gửi dưới type=system). Các type phía khách có focus
  // thì kèm param focus để màn chi tiết đơn tự cuộn tới khu vực thao tác.
  if (jobId) {
    const asHelper = asHelperFor(type, activeRole, roles);
    return jobRoute(jobId, asHelper, asHelper ? undefined : CUSTOMER_JOB_FOCUS[type]);
  }

  // system / promotion / khuyến mãi / không rõ → không có đích cụ thể.
  return null;
}

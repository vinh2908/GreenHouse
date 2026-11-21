// utils/job-status-badge.ts — R18: nhãn trạng thái cho chip JobStatusBadge
import { translate } from '../services/i18n';

export const JOB_STATUS_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  draft: { label: 'Bản nháp', color: '#F3F4F6', textColor: '#6B7280' },
  open: { label: 'Đang tìm thợ', color: '#EFF6FF', textColor: '#1D4ED8' },
  receiving_quotes: { label: 'Có báo giá', color: '#F5F3FF', textColor: '#6D28D9' },
  quote_selected: { label: 'Chờ thợ xác nhận', color: '#FFF7ED', textColor: '#C2410C' },
  confirmed: { label: 'Đã nhận đơn', color: '#FFF7ED', textColor: '#C2410C' },
  helper_on_the_way: { label: 'Đang di chuyển', color: '#FEF3C7', textColor: '#92400E' },
  helper_arrived: { label: 'Đã đến nơi', color: '#ECFDF5', textColor: '#065F46' },
  in_progress: { label: 'Đang thực hiện', color: '#F0FDF4', textColor: '#166534' },
  pending_review: { label: 'Chờ nghiệm thu', color: '#EFF6FF', textColor: '#1E40AF' },
  completed: { label: 'Hoàn tất', color: '#ECFDF5', textColor: '#065F46' },
  cancelled: { label: 'Đã hủy', color: '#FEF2F2', textColor: '#991B1B' },
  disputed: { label: 'Đang tranh chấp', color: '#FEF2F2', textColor: '#991B1B' },
  refunded: { label: 'Đã hoàn tiền', color: '#F3F4F6', textColor: '#374151' },
  expired: { label: 'Hết hạn', color: '#F3F4F6', textColor: '#6B7280' },
};

export function jobStatusBadgeLabel(
  status: string,
  role: 'customer' | 'helper' = 'customer',
  lang: 'vi' | 'en' = 'vi',
): string {
  const normalized = (status ?? '').toLowerCase().trim();
  const config = JOB_STATUS_CONFIG[normalized] ?? { label: status };

  if (role === 'helper') {
    if (normalized === 'open' || normalized === 'receiving_quotes' || normalized === 'new') {
      return lang === 'en' ? 'New' : (translate(lang, 'helper_jobs_tab_available') || 'Đơn mới');
    }
    if (normalized === 'completed') {
      return lang === 'en' ? 'Completed' : 'Đã hoàn thành';
    }
  }

  const translated = translate(lang, `status_${normalized}`);
  return translated === `status_${normalized}` ? config.label : translated;
}

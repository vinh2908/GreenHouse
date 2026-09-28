// Shared labels for job statuses in the jobs list and detail pages.
export const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'secondary'> =
  {
    open: 'info',
    receiving_quotes: 'info',
    confirmed: 'warning',
    helper_on_the_way: 'warning',
    helper_arrived: 'warning',
    in_progress: 'warning',
    pending_review: 'warning',
    completed: 'success',
    cancelled: 'danger',
    disputed: 'danger',
  };

export const STATUS_VI: Record<string, string> = {
  open: 'Mở',
  receiving_quotes: 'Nhận báo giá',
  confirmed: 'Xác nhận',
  helper_on_the_way: 'Trên đường',
  helper_arrived: 'Đã đến',
  in_progress: 'Đang làm',
  pending_review: 'Chờ nghiệm thu',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  disputed: 'Tranh chấp',
};

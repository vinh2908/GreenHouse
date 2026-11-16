// utils/job-can-edit.ts — R11 (L9): khách được sửa đơn ở trạng thái nào.
//
// Khớp server (JobsService.updateJob): chặn completed / cancelled /
// disputed / refunded VÀ pending_review — đơn đang chờ nghiệm thu (bước 7)
// không sửa được nữa. Client phải ẩn/khóa nút sửa từ đầu thay vì để khách
// mở modal sửa rồi mới bị server từ chối.
const NON_EDITABLE_STATUSES = ['completed', 'cancelled', 'disputed', 'refunded', 'pending_review'];

export function canEditJob(status: string | undefined | null): boolean {
  if (!status) return false;
  return !NON_EDITABLE_STATUSES.includes(status);
}

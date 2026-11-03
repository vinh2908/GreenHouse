/**
 * Chuẩn hóa chuỗi tiếng Việt: bỏ dấu thanh, chuyển đ/Đ thành d/D, chuyển chữ thường để tìm kiếm không phân biệt dấu.
 */
export function removeVietnameseDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

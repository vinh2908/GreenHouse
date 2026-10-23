/**
 * Chuẩn hóa và khử trùng lặp các mảnh địa chỉ hiển thị.
 * Tránh trường hợp lặp quận/phường như:
 * 'Phường Thanh Khê, Thanh Khê, Thành phố Đà Nẵng, Thanh Khê'
 */
export function formatDisplayAddress(
  addr?: {
    full_address?: string;
    ward?: string;
    district?: string;
    city?: string;
  } | null,
): string {
  if (!addr) return '';

  const full = (addr.full_address || '').trim();
  const rawParts: string[] = [];

  if (full) rawParts.push(full);

  const ward = (addr.ward || '').trim();
  const district = (addr.district || '').trim();
  const city = (addr.city || '').trim();

  const fullLower = full.toLowerCase();
  if (ward && !fullLower.includes(ward.toLowerCase())) {
    rawParts.push(ward);
  }
  if (district && !fullLower.includes(district.toLowerCase())) {
    rawParts.push(district);
  }
  if (city && !fullLower.includes(city.toLowerCase())) {
    rawParts.push(city);
  }

  // Tách tất cả các mảnh bằng dấu phẩy
  const combined = rawParts.join(', ');
  const tokens = combined
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const deduped: string[] = [];
  for (const token of tokens) {
    const tokenLower = token.toLowerCase();
    // Bỏ qua nếu đã có token tương tự hoặc trùng lặp
    const exists = deduped.some(
      existing =>
        existing.toLowerCase() === tokenLower ||
        existing.toLowerCase() === `quận ${tokenLower}` ||
        `quận ${existing.toLowerCase()}` === tokenLower ||
        existing.toLowerCase() === `phường ${tokenLower}` ||
        `phường ${existing.toLowerCase()}` === tokenLower,
    );
    if (!exists) {
      deduped.push(token);
    }
  }

  return deduped.join(', ');
}

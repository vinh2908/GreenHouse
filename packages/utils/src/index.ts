/**
 * Calculate distance between two lat/lng points using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const calculateDistanceKm = calculateDistance;

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format currency for Vietnamese Dong (VND)
 */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

/**
 * Generate a random OTP of given length
 */
export function generateOTP(length = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

/**
 * Normalize Vietnamese phone number to 10-digit format
 */
export function normalizePhone(phone: string): string {
  // Remove spaces, dashes, parentheses
  let normalized = phone.replace(/[\s\-().]/g, '');
  // Convert +84 to 0
  if (normalized.startsWith('+84')) {
    normalized = '0' + normalized.slice(3);
  } else if (normalized.startsWith('84') && normalized.length === 11) {
    normalized = '0' + normalized.slice(2);
  }
  return normalized;
}

// B88: regex SĐT VN duy nhất dùng chung — 10 chữ số, đầu 03/05/07/08/09.
// (Bản cũ /^(0[3|5|7|8|9])+([0-9]{8})$/ sai: [3|5|7|8|9] chứa cả ký tự '|'
// và dấu + cho phép lặp tiền tố, vd '09090...' vẫn khớp.)
export const VIETNAMESE_PHONE_REGEX = /^0(3|5|7|8|9)[0-9]{8}$/;

/**
 * Validate Vietnamese phone number
 */
export function isValidVietnamesePhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return VIETNAMESE_PHONE_REGEX.test(normalized);
}

/**
 * Create a slug from a Vietnamese string
 */
export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Paginate results
 */
export function getPaginationMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    total_pages: Math.ceil(total / limit),
  };
}

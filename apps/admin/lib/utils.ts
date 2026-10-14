import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Uploaded files keep the host the uploader used (LAN IP, 10.0.2.2 on the emulator),
// which this browser may not reach; re-point them at the API origin the admin uses.
export function mediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const i = url.indexOf('/uploads/');
  if (i === -1) return url;
  const origin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1').replace(
    /\/api\/v1\/?$/,
    '',
  );
  return `${origin}${url.slice(i)}`;
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

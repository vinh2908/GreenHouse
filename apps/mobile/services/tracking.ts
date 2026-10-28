export interface TrackingPoint {
  lat: number;
  lng: number;
  recorded_at: number;
  accuracy?: number;
}

export interface TrackingEvent {
  job_id: string;
  helper_id: string;
  location: TrackingPoint;
}

export const GPS_FRESH_MS = 30_000;
export const GPS_MAX_AGE_MS = 120_000;

export function validCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180
  );
}

export function acceptTrackingEvent(
  event: TrackingEvent,
  jobId: string,
  helperId?: string,
  previous?: TrackingPoint | null,
  now = Date.now(),
): boolean {
  const point = event?.location;
  return (
    event?.job_id === jobId &&
    (!helperId || event.helper_id === helperId) &&
    !!point &&
    validCoordinate(point.lat, point.lng) &&
    Number.isFinite(point.recorded_at) &&
    point.recorded_at <= now + 10_000 &&
    now - point.recorded_at <= GPS_MAX_AGE_MS &&
    (point.accuracy == null ||
      (Number.isFinite(point.accuracy) && point.accuracy >= 0 && point.accuracy <= 100)) &&
    (!previous || point.recorded_at > previous.recorded_at)
  );
}

export function trackingTitle(status: string, role: 'customer' | 'helper'): string {
  if (status === 'helper_on_the_way')
    return role === 'helper'
      ? 'Đang di chuyển đến khách'
      : 'Đang di chuyển đến bạn';
  if (status === 'helper_arrived')
    return role === 'helper' ? 'Đã tới điểm hẹn' : 'Thợ đã đến điểm hẹn';
  if (status === 'in_progress') return 'Đang thực hiện công việc';
  if (status === 'confirmed') return 'Đã nhận đơn — chuẩn bị đi';
  return 'Vị trí điểm hẹn làm việc';
}

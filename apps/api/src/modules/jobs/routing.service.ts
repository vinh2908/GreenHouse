import { Injectable } from '@nestjs/common';

export interface RouteResult {
  distance_km: number;
  estimated_minutes: number;
  estimated?: boolean;
  routing_error?: boolean;
}

@Injectable()
export class RoutingService {
  private cache = new Map<string, { result: RouteResult; expires: number }>();

  async getRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    timeoutMs = 6000,
  ): Promise<RouteResult> {
    // Làm tròn 3 chữ số thập phân (~110m) để chống rung toạ độ GPS khi làm mới
    const cacheKey = `${fromLat.toFixed(3)},${fromLng.toFixed(3)}-${toLat.toFixed(3)},${toLng.toFixed(3)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.result;

    // G3: getRoute ném lỗi khi Goong lỗi thay vì fallback lặng haversine
    const result = await this.fetchGoongDirections(fromLat, fromLng, toLat, toLng, timeoutMs);
    this.cache.set(cacheKey, { result, expires: Date.now() + 30 * 60 * 1000 });
    if (this.cache.size > 1000) this.evictOldest();
    return result;
  }

  async getRoutesBatch(
    fromLat: number,
    fromLng: number,
    destinations: Array<{ lat: number; lng: number; id: string }>,
    deadlineMs = 7000,
  ): Promise<Map<string, RouteResult>> {
    const results = new Map<string, RouteResult>();
    const startTime = Date.now();
    // D-TIME: Giới hạn concurrency tối đa 5 requests song song tới Goong API để chống timeout/rate-limit
    const BATCH_SIZE = 5;

    for (let i = 0; i < destinations.length; i += BATCH_SIZE) {
      const remainingTime = deadlineMs - (Date.now() - startTime);

      // G4: Thêm deadline tổng cho tuyến đường. Quá deadline thì dùng haversine + cờ estimated: true
      if (remainingTime <= 400) {
        for (const dest of destinations.slice(i)) {
          const fallback = this.haversineFallback(fromLat, fromLng, dest.lat, dest.lng);
          results.set(dest.id, { ...fallback, estimated: true });
        }
        break;
      }

      const chunk = destinations.slice(i, i + BATCH_SIZE);
      const reqTimeout = Math.min(5000, Math.max(1000, remainingTime));

      await Promise.all(
        chunk.map(async dest => {
          try {
            const route = await this.getRoute(fromLat, fromLng, dest.lat, dest.lng, reqTimeout);
            results.set(dest.id, route);
          } catch {
            const elapsed = Date.now() - startTime;
            if (elapsed >= deadlineMs) {
              // Quá deadline tổng -> dùng haversine + cờ estimated: true
              const fallback = this.haversineFallback(fromLat, fromLng, dest.lat, dest.lng);
              results.set(dest.id, { ...fallback, estimated: true });
            } else {
              // G3: Goong lỗi thực sự -> đánh dấu routing_error để client hiện trạng thái lỗi + thử lại
              results.set(dest.id, {
                ...this.haversineFallback(fromLat, fromLng, dest.lat, dest.lng),
                routing_error: true,
              });
            }
          }
        }),
      );
    }
    return results;
  }

  private async fetchGoongDirections(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    timeoutMs = 6000,
  ): Promise<RouteResult> {
    const apiKey = process.env.GOONG_API_KEY || process.env.EXPO_PUBLIC_GOONG_API_KEY;
    if (!apiKey) throw new Error('Missing Goong API key');

    const url = `https://rsapi.goong.io/Direction?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&vehicle=bike&api_key=${apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Goong Direction HTTP ${res.status}`);
      const data = await res.json();

      if (!data.routes?.length) {
        throw new Error('No route found from Goong');
      }

      const leg = data.routes[0].legs?.[0];
      const distMeters = leg?.distance?.value ?? 0;
      const durSeconds = leg?.duration?.value ?? 0;

      return {
        distance_km: Math.round((distMeters / 1000) * 10) / 10,
        estimated_minutes: Math.max(1, Math.round(durSeconds / 60)),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private haversineFallback(lat1: number, lon1: number, lat2: number, lon2: number): RouteResult {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // Road distance ~1.4x straight line in urban areas
    const roadDist = distKm * 1.4;
    return {
      distance_km: Math.round(roadDist * 10) / 10,
      estimated_minutes: Math.round(roadDist <= 2 ? roadDist * 6 : roadDist * 3 + 6),
    };
  }

  private evictOldest() {
    const now = Date.now();
    for (const [key, val] of this.cache) {
      if (val.expires < now) this.cache.delete(key);
    }
    if (this.cache.size > 400) {
      const keys = [...this.cache.keys()];
      for (let i = 0; i < 100; i++) this.cache.delete(keys[i]);
    }
  }
}

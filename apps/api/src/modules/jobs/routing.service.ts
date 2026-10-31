import { Injectable } from '@nestjs/common';

export interface RouteResult {
  distance_km: number;
  estimated_minutes: number;
}

@Injectable()
export class RoutingService {
  private cache = new Map<string, { result: RouteResult; expires: number }>();

  async getRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ): Promise<RouteResult> {
    const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.result;

    try {
      const result = await this.fetchGoongDirections(fromLat, fromLng, toLat, toLng);
      this.cache.set(cacheKey, { result, expires: Date.now() + 10 * 60 * 1000 });
      if (this.cache.size > 500) this.evictOldest();
      return result;
    } catch {
      return this.haversineFallback(fromLat, fromLng, toLat, toLng);
    }
  }

  async getRoutesBatch(
    fromLat: number,
    fromLng: number,
    destinations: Array<{ lat: number; lng: number; id: string }>,
  ): Promise<Map<string, RouteResult>> {
    const results = new Map<string, RouteResult>();
    const promises = destinations.map(async dest => {
      const route = await this.getRoute(fromLat, fromLng, dest.lat, dest.lng);
      results.set(dest.id, route);
    });
    await Promise.all(promises);
    return results;
  }

  private async fetchGoongDirections(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ): Promise<RouteResult> {
    const apiKey = process.env.GOONG_API_KEY || process.env.EXPO_PUBLIC_GOONG_API_KEY;
    if (!apiKey) throw new Error('Missing Goong API key');

    const url = `https://rsapi.goong.io/Direction?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&vehicle=bike&api_key=${apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

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

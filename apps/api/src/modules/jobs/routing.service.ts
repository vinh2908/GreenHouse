import { Injectable, Logger } from '@nestjs/common';

export interface RouteResult {
  distance_km: number;
  estimated_minutes: number;
  estimated?: boolean;
  routing_error?: boolean;
  // B2: lý do lỗi Goong (để client/log phân biệt key/quota/timeout/không có tuyến)
  routing_error_reason?: GoongRouteErrorKind;
}

/**
 * B2: Phân loại lỗi Goong Directions để (a) log được lý do thật thay vì nuốt lỗi,
 * (b) biết lỗi nào thử lại được (timeout/5xx/429) và lỗi nào thử lại cũng vô ích
 * (thiếu key, key sai loại, không có tuyến). G3 giữ nguyên: lỗi thật vẫn ném ra
 * (không fallback lặng sang haversine) — chỉ khác là giờ lỗi mang theo lý do.
 */
export type GoongRouteErrorKind =
  'missing_key' | 'auth' | 'rate_limited' | 'timeout' | 'no_route' | 'http' | 'invalid_coords';

export class GoongRouteError extends Error {
  readonly kind: GoongRouteErrorKind;
  readonly status?: number;
  /** Lỗi thoáng qua (timeout/5xx/429): thử lại có thể thành công. */
  readonly retryable: boolean;

  constructor(
    kind: GoongRouteErrorKind,
    message: string,
    opts: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'GoongRouteError';
    this.kind = kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

export interface GetRouteOptions {
  /** Bỏ qua cache thành công 30 phút — nút "Bấm thử lại" phải tính lại thật. */
  forceRefresh?: boolean;
  /** Số lần thử tối đa (mặc định 2: 1 lần thử lại cho lỗi thoáng qua). */
  maxAttempts?: number;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private cache = new Map<string, { result: RouteResult; expires: number }>();

  /**
   * B2: timeout mặc định 6s -> 10s (bằng timeout phía client ở live-tracking-map).
   * Render free-tier + bắt tay TLS tới Goong có thể chậm hơn 6s vào lúc server vừa thức.
   */
  async getRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    timeoutMs = 10000,
    opts: GetRouteOptions = {},
  ): Promise<RouteResult> {
    // B2: không gửi toạ độ rác sang Goong — (0,0)/NaN/ngoài khoảng chỉ nhận về 400.
    this.validateCoords(fromLat, fromLng, 'origin');
    this.validateCoords(toLat, toLng, 'destination');

    // B2: thợ đã đứng ngay tại địa chỉ đơn (thường gặp khi test tại nhà) thì Goong
    // không trả tuyến cho origin ≈ destination ("No route found") -> lỗi đỏ vĩnh
    // viễn dù hai toạ độ đều đúng. Dưới ~150m thì không cần gọi Directions.
    if (this.haversineKm(fromLat, fromLng, toLat, toLng) < 0.15) {
      return { distance_km: 0.1, estimated_minutes: 1 };
    }

    // Làm tròn 3 chữ số thập phân (~110m) để chống rung toạ độ GPS khi làm mới
    const cacheKey = `${fromLat.toFixed(3)},${fromLng.toFixed(3)}-${toLat.toFixed(3)},${toLng.toFixed(3)}`;
    if (!opts.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expires > Date.now()) return cached.result;
    }

    // G3: getRoute ném lỗi khi Goong lỗi thay vì fallback lặng haversine
    const result = await this.fetchGoongDirections(
      fromLat,
      fromLng,
      toLat,
      toLng,
      timeoutMs,
      Math.max(1, opts.maxAttempts ?? 2),
    );
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
            // B2: batch đã có deadline tổng riêng nên không thử lại trong từng tuyến —
            // thử lại ở đây chỉ làm quá deadline và dồn thêm request vào Goong.
            const route = await this.getRoute(fromLat, fromLng, dest.lat, dest.lng, reqTimeout, {
              maxAttempts: 1,
            });
            results.set(dest.id, route);
          } catch (err) {
            const elapsed = Date.now() - startTime;
            const reason = err instanceof GoongRouteError ? err.kind : 'http';
            if (elapsed >= deadlineMs) {
              // Quá deadline tổng -> dùng haversine + cờ estimated: true
              const fallback = this.haversineFallback(fromLat, fromLng, dest.lat, dest.lng);
              results.set(dest.id, { ...fallback, estimated: true });
            } else {
              // G3: Goong lỗi thực sự -> đánh dấu routing_error để client hiện trạng thái lỗi + thử lại
              results.set(dest.id, {
                ...this.haversineFallback(fromLat, fromLng, dest.lat, dest.lng),
                routing_error: true,
                routing_error_reason: reason,
              });
            }
          }
        }),
      );
    }
    return results;
  }

  /**
   * B2: gọi Goong Directions, thử lại tối đa maxAttempts lần CHỈ cho lỗi thoáng qua
   * (timeout / 5xx / lỗi mạng), trong ngân sách timeoutMs của caller. Lỗi 401/403
   * (key sai loại/hết hạn), 429 (hết quota) và không có tuyến thì ném ngay — thử lại
   * ngay cũng chỉ nhận cùng một kết quả.
   */
  private async fetchGoongDirections(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    timeoutMs: number,
    maxAttempts: number,
  ): Promise<RouteResult> {
    const apiKey = process.env.GOONG_API_KEY || process.env.EXPO_PUBLIC_GOONG_API_KEY;
    if (!apiKey) {
      // B2: đây là nghi phạm số 1 của lỗi live — key REST chỉ có trong env Vercel
      // (build client), còn API trên Render chưa chắc đã có GOONG_API_KEY. Key
      // Maptiles (GreenHouse-Map) không dùng được cho Directions (403). Lỗi này
      // thử lại bao nhiêu lần cũng không hết nên phải log rõ để sửa env, thay vì
      // để client hiện "Bấm thử lại" vô ích.
      this.logger.error(
        'Goong Direction: thiếu API key — GOONG_API_KEY (hoặc EXPO_PUBLIC_GOONG_API_KEY) ' +
          'chưa được cấu hình trên API server (Render). Lưu ý: key Maptiles không gọi ' +
          'được Directions, cần key REST (GreenHouse).',
      );
      throw new GoongRouteError(
        'missing_key',
        'Missing Goong API key — GOONG_API_KEY chưa được cấu hình trên API server',
        { retryable: false },
      );
    }

    const deadline = Date.now() + timeoutMs;
    let lastError: GoongRouteError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        return await this.fetchGoongDirectionsOnce(
          fromLat,
          fromLng,
          toLat,
          toLng,
          apiKey,
          remaining,
        );
      } catch (err) {
        lastError =
          err instanceof GoongRouteError
            ? err
            : new GoongRouteError(
                'http',
                `Goong request failed: ${(err as Error)?.message ?? err}`,
                {
                  retryable: true,
                },
              );
        this.logGoongFailure(lastError, fromLat, fromLng, toLat, toLng, attempt, maxAttempts);
        // 429 (hết quota): thử lại ngay chỉ đốt thêm quota — để client thử lại sau.
        if (!lastError.retryable || lastError.kind === 'rate_limited' || attempt >= maxAttempts)
          throw lastError;
        // Chỉ thử lại khi còn đủ ngân sách cho một lần gọi nữa (trừ 1s dự phòng).
        const waitMs = Math.min(400, deadline - Date.now() - 1000);
        if (waitMs <= 0) throw lastError;
        await this.sleep(waitMs);
      }
    }
    throw (
      lastError ?? new GoongRouteError('timeout', 'Goong Direction timed out', { retryable: true })
    );
  }

  private async fetchGoongDirectionsOnce(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    apiKey: string,
    timeoutMs: number,
  ): Promise<RouteResult> {
    const url = `https://rsapi.goong.io/Direction?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&vehicle=bike&api_key=${apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
      });

      if (!res.ok) {
        // B2: đọc body lỗi của Goong ({error:{code,message}}: "API key not valid",
        // "Quota exceeded"...) thay vì chỉ ném status — không có message thì không
        // ai chẩn đoán được key sai hay hết quota.
        const goongMessage = await this.readGoongErrorMessage(res);
        const suffix = goongMessage ? `: ${goongMessage}` : '';
        if (res.status === 401 || res.status === 403) {
          throw new GoongRouteError(
            'auth',
            `Goong Direction HTTP ${res.status}${suffix} — key sai loại (cần key REST) hoặc hết hạn`,
            { status: res.status, retryable: false },
          );
        }
        if (res.status === 429) {
          throw new GoongRouteError(
            'rate_limited',
            `Goong Direction HTTP 429${suffix} — đã hết quota Goong, thử lại sau`,
            { status: res.status, retryable: true },
          );
        }
        if (res.status >= 500) {
          throw new GoongRouteError('http', `Goong Direction HTTP ${res.status}${suffix}`, {
            status: res.status,
            retryable: true,
          });
        }
        throw new GoongRouteError('http', `Goong Direction HTTP ${res.status}${suffix}`, {
          status: res.status,
          retryable: false,
        });
      }
      const data = await res.json();

      // Goong có thể trả lỗi dạng {error:{code,message}} kèm HTTP 200.
      const goongError = (data as any)?.error;
      if (goongError) {
        const message =
          typeof goongError === 'string'
            ? goongError
            : (goongError.message ?? JSON.stringify(goongError));
        throw new GoongRouteError('http', `Goong Direction: ${message}`, { retryable: false });
      }

      if (!data.routes?.length) {
        throw new GoongRouteError('no_route', 'No route found from Goong', { retryable: false });
      }

      const leg = data.routes[0].legs?.[0];
      const distMeters = leg?.distance?.value ?? 0;
      const durSeconds = leg?.duration?.value ?? 0;

      return {
        distance_km: Math.round((distMeters / 1000) * 10) / 10,
        estimated_minutes: Math.max(1, Math.round(durSeconds / 60)),
      };
    } catch (err) {
      if (err instanceof GoongRouteError) throw err;
      if ((err as any)?.name === 'AbortError') {
        throw new GoongRouteError('timeout', `Goong Direction timed out sau ${timeoutMs}ms`, {
          retryable: true,
        });
      }
      throw new GoongRouteError('http', `Goong request failed: ${(err as Error)?.message ?? err}`, {
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Đọc message lỗi Goong từ body (best-effort, cắt ngắn); không bao giờ log URL/key. */
  private async readGoongErrorMessage(res: { text(): Promise<string> }): Promise<string> {
    try {
      const text = await res.text();
      if (!text) return '';
      try {
        const parsed = JSON.parse(text);
        const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error;
        return typeof message === 'string' ? message.slice(0, 200) : text.slice(0, 200);
      } catch {
        return text.slice(0, 200);
      }
    } catch {
      return '';
    }
  }

  /** B2: log lý do Goong thất bại (kind/status/message + toạ độ làm tròn). KHÔNG log URL vì URL chứa API key. */
  private logGoongFailure(
    err: GoongRouteError,
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    attempt: number,
    maxAttempts: number,
  ): void {
    const msg =
      `Goong Direction thất bại kind=${err.kind} status=${err.status ?? '-'} ` +
      `attempt=${attempt}/${maxAttempts} ` +
      `origin=${fromLat.toFixed(3)},${fromLng.toFixed(3)} ` +
      `dest=${toLat.toFixed(3)},${toLng.toFixed(3)}: ${err.message}`;
    if (err.kind === 'auth') this.logger.error(msg);
    else this.logger.warn(msg);
  }

  private validateCoords(lat: number, lng: number, label: string): void {
    const invalid =
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180 ||
      (lat === 0 && lng === 0); // (0,0) "Null Island" không bao giờ là vị trí thật ở VN
    if (invalid) {
      const err = new GoongRouteError('invalid_coords', `Invalid ${label} coords: ${lat},${lng}`, {
        retryable: false,
      });
      this.logger.warn(`Goong Direction: bỏ qua vì toạ độ ${label} không hợp lệ (${lat},${lng})`);
      throw err;
    }
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private haversineFallback(lat1: number, lon1: number, lat2: number, lon2: number): RouteResult {
    const distKm = this.haversineKm(lat1, lon1, lat2, lon2);
    // Road distance ~1.4x straight line in urban areas
    const roadDist = distKm * 1.4;
    return {
      distance_km: Math.round(roadDist * 10) / 10,
      estimated_minutes: Math.round(roadDist <= 2 ? roadDist * 6 : roadDist * 3 + 6),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

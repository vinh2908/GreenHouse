import { GoongRouteError, RoutingService } from './routing.service';
import { Types } from 'mongoose';
import { JobsService } from './jobs.service';

/**
 * B2 — Goong route/directions lỗi trên điện thoại thật (live 2026-11-12):
 * màn chi tiết thợ hiện "Không lấy được tuyến đường · Bấm thử lại" và bấm thử lại
 * cũng không hết. Các test dưới đây PHẢI FAIL trên code cũ (8b92a7a) và PASS sau fix:
 * - code cũ nuốt mọi lỗi Goong (catch {} ở enrichJobWithDistance), không log lý do,
 *   không phân biệt thiếu key / key sai loại / hết quota / timeout / không có tuyến;
 * - code cũ chỉ dùng vị trí thợ ĐÃ LƯU (có thể cũ nhiều giờ) cho màn chi tiết,
 *   trong khi danh sách đơn đã ưu tiên GPS thật (H24/K8);
 * - code cũ gửi cả origin ≈ destination sang Goong (thợ test tại nhà) — Goong
 *   không trả tuyến cho 2 điểm trùng nhau;
 * - code cũ thử lại 1 lần duy nhất, timeout 6s, không đọc body lỗi của Goong.
 */
describe('B2 — Goong route/directions (live 2026-11-12)', () => {
  const ORIGINAL_GOONG_KEY = process.env.GOONG_API_KEY;
  const ORIGINAL_EXPO_GOONG_KEY = process.env.EXPO_PUBLIC_GOONG_API_KEY;
  const originalFetch = globalThis.fetch;

  const goongOk = (meters = 5900, seconds = 900) => ({
    ok: true,
    status: 200,
    json: async () => ({
      routes: [
        {
          legs: [{ distance: { value: meters }, duration: { value: seconds } }],
          overview_polyline: { points: 'abc' },
        },
      ],
    }),
    text: async () => '',
  });

  const goongErr = (status: number, message: string) => ({
    ok: false,
    status,
    json: async () => ({ error: { code: status, message } }),
    text: async () => JSON.stringify({ error: { code: status, message } }),
  });

  beforeEach(() => {
    process.env.GOONG_API_KEY = 'test-goong-key';
    delete process.env.EXPO_PUBLIC_GOONG_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_GOONG_KEY === undefined) delete process.env.GOONG_API_KEY;
    else process.env.GOONG_API_KEY = ORIGINAL_GOONG_KEY;
    if (ORIGINAL_EXPO_GOONG_KEY === undefined) delete process.env.EXPO_PUBLIC_GOONG_API_KEY;
    else process.env.EXPO_PUBLIC_GOONG_API_KEY = ORIGINAL_EXPO_GOONG_KEY;
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('RoutingService.getRoute — phân loại lỗi Goong', () => {
    it('thiếu key trên API server -> kind missing_key, không retry được, không gọi fetch', async () => {
      delete process.env.GOONG_API_KEY;
      delete process.env.EXPO_PUBLIC_GOONG_API_KEY;
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      let caught: any;
      try {
        await routingService.getRoute(16.054, 108.202, 16.07, 108.22);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GoongRouteError);
      expect(caught.kind).toBe('missing_key');
      expect(caught.retryable).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('Goong 403 + body "API key not valid" -> kind auth, giữ message Goong, chỉ gọi 1 lần', async () => {
      const fetchMock = jest.fn().mockResolvedValue(goongErr(403, 'API key not valid'));
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      let caught: any;
      try {
        await routingService.getRoute(16.054, 108.202, 16.07, 108.22);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GoongRouteError);
      expect(caught.kind).toBe('auth');
      expect(caught.status).toBe(403);
      expect(caught.retryable).toBe(false);
      expect(caught.message).toContain('API key not valid');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('Goong 429 (hết quota) -> kind rate_limited, retryable, không thử lại ngay trong cùng 1 lần gọi', async () => {
      const fetchMock = jest.fn().mockResolvedValue(goongErr(429, 'Quota exceeded'));
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      let caught: any;
      try {
        await routingService.getRoute(16.054, 108.202, 16.07, 108.22);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GoongRouteError);
      expect(caught.kind).toBe('rate_limited');
      expect(caught.retryable).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('Goong 500 thoáng qua -> tự thử lại 1 lần rồi trả tuyến', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(goongErr(500, 'Internal error'))
        .mockResolvedValueOnce(goongOk());
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      const route = await routingService.getRoute(16.054, 108.202, 16.07, 108.22);
      expect(route.distance_km).toBe(5.9);
      expect(route.estimated_minutes).toBe(15);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('timeout (AbortError) thoáng qua -> tự thử lại 1 lần rồi trả tuyến', async () => {
      const abortErr: any = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      const fetchMock = jest.fn().mockRejectedValueOnce(abortErr).mockResolvedValueOnce(goongOk());
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      const route = await routingService.getRoute(16.054, 108.202, 16.07, 108.22);
      expect(route.distance_km).toBe(5.9);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('Goong treo quá timeout -> kind timeout, retryable (dùng AbortController thật)', async () => {
      const fetchMock = jest.fn((_url: string, opts: any) => {
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            const err: any = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      let caught: any;
      try {
        await routingService.getRoute(16.054, 108.202, 16.07, 108.22, 50);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GoongRouteError);
      expect(caught.kind).toBe('timeout');
      expect(caught.retryable).toBe(true);
    });

    it('Goong trả 200 nhưng không có routes -> kind no_route', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ routes: [] }),
        text: async () => '',
      });
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      let caught: any;
      try {
        await routingService.getRoute(16.054, 108.202, 16.07, 108.22);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GoongRouteError);
      expect(caught.kind).toBe('no_route');
      expect(caught.retryable).toBe(false);
    });
  });

  describe('RoutingService.getRoute — toạ độ suy biến + cache', () => {
    it('thợ đứng ngay tại địa chỉ đơn (origin ≈ destination) -> trả 0.1km/1 phút, KHÔNG gọi Goong', async () => {
      const fetchMock = jest.fn().mockResolvedValue(goongOk());
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      const route = await routingService.getRoute(16.054, 108.202, 16.054, 108.202);
      expect(route).toEqual({ distance_km: 0.1, estimated_minutes: 1 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('origin và destination cách nhau < 150m -> không gọi Goong', async () => {
      const fetchMock = jest.fn().mockResolvedValue(goongOk());
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      const route = await routingService.getRoute(16.054, 108.202, 16.0545, 108.2025);
      expect(route.distance_km).toBe(0.1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('toạ độ (0,0) -> kind invalid_coords, không gọi Goong', async () => {
      const fetchMock = jest.fn().mockResolvedValue(goongOk());
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      let caught: any;
      try {
        await routingService.getRoute(0, 0, 16.07, 108.22);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GoongRouteError);
      expect(caught.kind).toBe('invalid_coords');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('forceRefresh bỏ qua cache thành công 30 phút (nút thử lại tính lại thật)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(goongOk());
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      await routingService.getRoute(16.054, 108.202, 16.07, 108.22);
      await routingService.getRoute(16.054, 108.202, 16.07, 108.22);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await routingService.getRoute(16.054, 108.202, 16.07, 108.22, undefined, {
        forceRefresh: true,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('RoutingService.getRoutesBatch — lý do lỗi đi kèm routing_error', () => {
    it('Goong 500 cho cả batch -> routing_error + routing_error_reason, không ném', async () => {
      const fetchMock = jest.fn().mockResolvedValue(goongErr(500, 'Internal error'));
      globalThis.fetch = fetchMock as any;
      const routingService = new RoutingService();

      const routes = await routingService.getRoutesBatch(16.054, 108.202, [
        { id: 'job-1', lat: 16.06, lng: 108.21 },
        { id: 'job-2', lat: 16.07, lng: 108.22 },
      ]);
      expect(routes.get('job-1')?.routing_error).toBe(true);
      expect(routes.get('job-1')?.routing_error_reason).toBe('http');
      expect(routes.get('job-2')?.routing_error).toBe(true);
      // Batch có deadline riêng nên mỗi tuyến chỉ gọi Goong 1 lần (không thử lại trong batch).
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('JobsService.enrichJobWithDistance — chọn điểm xuất phát', () => {
    const helperId = new Types.ObjectId().toHexString();
    const jobCoords = { address: { location: { coordinates: [108.22, 16.07] } } };

    const mockHelperModel = (profile: any) => ({
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(profile),
          }),
        }),
      }),
    });

    const buildJobsService = (helperModel: any, routingService: RoutingService) => {
      const dummy = {} as never;
      return new JobsService(
        dummy,
        dummy,
        dummy,
        dummy,
        helperModel,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        dummy,
        routingService,
        dummy,
        dummy,
        dummy,
        dummy,
      );
    };

    it('GPS đã lưu quá 120 phút -> không gọi Goong, không gắn routing_error', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Goong down')) as any;
      const routingService = new RoutingService();
      const getRouteSpy = jest.spyOn(routingService, 'getRoute');
      const staleProfile = {
        location: { type: 'Point', coordinates: [108.202, 16.054] },
        location_source: 'gps',
        last_location_update: new Date(Date.now() - 3 * 60 * 60 * 1000),
      };
      const jobsService = buildJobsService(mockHelperModel(staleProfile), routingService);

      const result = await (jobsService as any).enrichJobWithDistance({ ...jobCoords }, helperId);
      expect(getRouteSpy).not.toHaveBeenCalled();
      expect(result.routing_error).toBeUndefined();
      expect(result.distance_km).toBeUndefined();
    });

    it('GPS đã lưu cũ nhưng request gửi kèm GPS thật -> tính tuyến từ GPS thật', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(goongOk()) as any;
      const routingService = new RoutingService();
      const getRouteSpy = jest.spyOn(routingService, 'getRoute');
      const staleProfile = {
        location: { type: 'Point', coordinates: [108.202, 16.054] },
        location_source: 'gps',
        last_location_update: new Date(Date.now() - 3 * 60 * 60 * 1000),
      };
      const jobsService = buildJobsService(mockHelperModel(staleProfile), routingService);

      const result = await (jobsService as any).enrichJobWithDistance({ ...jobCoords }, helperId, {
        lat: 16.06,
        lng: 108.21,
      });
      expect(getRouteSpy).toHaveBeenCalled();
      expect(getRouteSpy.mock.calls[0].slice(0, 4)).toEqual([16.06, 108.21, 16.07, 108.22]);
      expect(result.distance_km).toBe(5.9);
      expect(result.routing_error).toBeUndefined();
    });

    it('ghim tay (manual) dù cũ vẫn dùng được — không hết hạn như GPS', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(goongOk()) as any;
      const routingService = new RoutingService();
      const getRouteSpy = jest.spyOn(routingService, 'getRoute');
      const manualProfile = {
        location: { type: 'Point', coordinates: [108.202, 16.054] },
        location_source: 'manual',
        last_location_update: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      };
      const jobsService = buildJobsService(mockHelperModel(manualProfile), routingService);

      const result = await (jobsService as any).enrichJobWithDistance({ ...jobCoords }, helperId);
      expect(getRouteSpy).toHaveBeenCalled();
      expect(getRouteSpy.mock.calls[0].slice(0, 4)).toEqual([16.054, 108.202, 16.07, 108.22]);
      expect(result.distance_km).toBe(5.9);
    });

    it('Goong 403 -> routing_error kèm routing_error_reason=auth (không nuốt lý do)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(goongErr(403, 'API key not valid')) as any;
      const routingService = new RoutingService();
      const freshProfile = {
        location: { type: 'Point', coordinates: [108.202, 16.054] },
        location_source: 'gps',
        last_location_update: new Date(),
      };
      const jobsService = buildJobsService(mockHelperModel(freshProfile), routingService);

      const result = await (jobsService as any).enrichJobWithDistance({ ...jobCoords }, helperId);
      expect(result.routing_error).toBe(true);
      expect(result.routing_error_reason).toBe('auth');
      expect(result.distance_km).toBeUndefined();
    });
  });
});

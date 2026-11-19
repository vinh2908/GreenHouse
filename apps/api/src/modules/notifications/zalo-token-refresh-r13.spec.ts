import { NOTIFICATION_TYPES } from '@homemate/constants';
import { ZaloTokenService, ZALO_OA_TOKEN_URL } from './zalo-token.service';
import { ZaloNotificationService } from './zalo.service';

/**
 * R13-I2 — Zalo OA token refresh.
 *
 * Access token OA sống ~25 giờ; code cũ đọc ZALO_OA_ACCESS_TOKEN từ env và
 * dùng nguyên văn nên ZNS chết lặng sau ~1 ngày. Fix: ZaloTokenService
 * refresh qua OAuth v4 (app_id/secret_key/refresh_token), cache + refresh
 * chủ động trước hạn, single-flight, lưu refresh token mới vào Mongo ngay.
 *
 * FAILS on base d06aa9c: ZaloTokenService does not exist (import error) and
 * ZaloNotificationService never retries on -216/-220.
 */
describe('R13-I2: ZaloTokenService', () => {
  const USER_ID = '507f1f77bcf86cd799439011';

  function makeConfig(values: Record<string, string>) {
    return { get: jest.fn((key: string) => values[key] ?? '') } as any;
  }

  function makeModel(storedRefreshToken: string | null) {
    return {
      findOne: jest.fn(() => ({
        lean: () => ({
          exec: async () => (storedRefreshToken ? { refresh_token: storedRefreshToken } : null),
        }),
      })),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => ({}) })),
    } as any;
  }

  const okJson = (body: any) => ({ ok: true, status: 200, json: async () => body });

  const OAUTH_CONFIG = {
    'zalo.appId': 'app123',
    'zalo.appSecret': 'secret123',
    'zalo.refreshToken': 'envRT',
    'zalo.accessToken': 'staticTok',
  };

  it('refresh returns the new access token and persists the new refresh token', async () => {
    const model = makeModel(null);
    const fetchMock = jest.fn(async (..._args: any[]) =>
      okJson({ access_token: 'tokA', refresh_token: 'rtA', expires_in: 90000 }),
    );
    const service = new ZaloTokenService(makeConfig(OAUTH_CONFIG), model, fetchMock as any);

    expect(await service.refreshAccessToken()).toBe('tokA');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ZALO_OA_TOKEN_URL);
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=envRT');
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'zalo-oa' },
      { $set: { refresh_token: 'rtA' } },
      { upsert: true, new: true },
    );
  });

  it('DB persist failure still returns the new access token (chain broken — manual re-consent needed)', async () => {
    // Review 2 nit: if the Mongo upsert fails AFTER Zalo already rotated
    // the single-use refresh token, the new token is lost — the next
    // refresh reuses the invalidated old token and fails. The service logs
    // loudly and still returns the new access token for THIS send; the
    // operator must re-run OAuth consent. This test pins that behavior.
    const model = makeModel(null);
    model.findOneAndUpdate = jest.fn(() => ({
      exec: async () => {
        throw new Error('mongo down');
      },
    }));
    const fetchMock = jest.fn(async (..._args: any[]) =>
      okJson({ access_token: 'tokA', refresh_token: 'rtA', expires_in: 90000 }),
    );
    const service = new ZaloTokenService(makeConfig(OAUTH_CONFIG), model, fetchMock as any);

    await expect(service.refreshAccessToken()).resolves.toBe('tokA');
    expect(model.findOneAndUpdate).toHaveBeenCalled();
  });

  it('valid cached token is reused without another fetch', async () => {
    const fetchMock = jest.fn(async (..._args: any[]) =>
      okJson({ access_token: 'tokA', refresh_token: 'rtA', expires_in: 90000 }),
    );
    const service = new ZaloTokenService(
      makeConfig(OAUTH_CONFIG),
      makeModel(null),
      fetchMock as any,
    );
    await service.refreshAccessToken();
    expect(await service.getAccessToken()).toBe('tokA');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('expired cached token triggers a fresh refresh', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ access_token: 'tokA', refresh_token: 'rtA', expires_in: 1 }))
      .mockResolvedValueOnce(
        okJson({ access_token: 'tokB', refresh_token: 'rtB', expires_in: 90000 }),
      );
    const service = new ZaloTokenService(
      makeConfig(OAUTH_CONFIG),
      makeModel(null),
      fetchMock as any,
    );
    await service.refreshAccessToken();
    expect(await service.getAccessToken()).toBe('tokB');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('concurrent refreshes share one in-flight request (single-flight)', async () => {
    let resolveFetch!: (v: any) => void;
    const fetchMock = jest.fn(
      (..._args: any[]) =>
        new Promise(res => {
          resolveFetch = res;
        }),
    );
    const service = new ZaloTokenService(
      makeConfig(OAUTH_CONFIG),
      makeModel(null),
      fetchMock as any,
    );
    const p1 = service.refreshAccessToken();
    const p2 = service.refreshAccessToken();
    const p3 = service.refreshAccessToken();
    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(okJson({ access_token: 'tok', refresh_token: 'rt', expires_in: 90000 }));
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual(['tok', 'tok', 'tok']);
  });

  it('refresh failure returns null (no throw) and getAccessToken falls back to the static token', async () => {
    const fetchMock = jest.fn(async (..._args: any[]) =>
      okJson({ error: -216, message: 'invalid refresh token' }),
    );
    const service = new ZaloTokenService(
      makeConfig(OAUTH_CONFIG),
      makeModel(null),
      fetchMock as any,
    );
    await expect(service.refreshAccessToken()).resolves.toBeNull();
    expect(await service.getAccessToken()).toBe('staticTok');
  });

  it('without OAuth config, getAccessToken returns the static env token and never fetches', async () => {
    const fetchMock = jest.fn(async (..._args: any[]) => okJson({}));
    const service = new ZaloTokenService(
      makeConfig({ 'zalo.accessToken': 'staticTok' }),
      makeModel(null),
      fetchMock as any,
    );
    expect(await service.getAccessToken()).toBe('staticTok');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with nothing configured, getAccessToken returns null', async () => {
    const fetchMock = jest.fn(async (..._args: any[]) => okJson({}));
    const service = new ZaloTokenService(makeConfig({}), makeModel(null), fetchMock as any);
    expect(await service.getAccessToken()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('DB-stored refresh token is preferred over the env one', async () => {
    const fetchMock = jest.fn(async (..._args: any[]) =>
      okJson({ access_token: 'tokA', refresh_token: 'rtA', expires_in: 90000 }),
    );
    const service = new ZaloTokenService(
      makeConfig(OAUTH_CONFIG),
      makeModel('dbRT'),
      fetchMock as any,
    );
    await service.refreshAccessToken();
    expect(String(fetchMock.mock.calls[0][1].body)).toContain('refresh_token=dbRT');
  });

  it('invalidateAndRefresh forces a refresh even with a valid cache', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        okJson({ access_token: 'tokA', refresh_token: 'rtA', expires_in: 90000 }),
      )
      .mockResolvedValueOnce(
        okJson({ access_token: 'tokB', refresh_token: 'rtB', expires_in: 90000 }),
      );
    const service = new ZaloTokenService(
      makeConfig(OAUTH_CONFIG),
      makeModel(null),
      fetchMock as any,
    );
    await service.refreshAccessToken();
    expect(await service.invalidateAndRefresh()).toBe('tokB');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('R13-I2: ZaloNotificationService retries once after an auth error', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  function makeService(tokenService: any, fetchMock: jest.Mock) {
    const config = {
      get: jest.fn((key: string) => (key === 'zalo.znsTemplateId' ? 'tmpl1' : '')),
    } as any;
    const userModel: any = {
      findById: jest.fn(() => ({
        select: () => ({
          lean: () => ({ exec: async () => ({ phone: '0365290805' }) }),
        }),
      })),
    };
    (global as any).fetch = fetchMock;
    return new ZaloNotificationService(config, userModel, tokenService);
  }

  const input = {
    _id: '507f1f77bcf86cd799439011',
    user_id: '507f1f77bcf86cd799439011',
    type: NOTIFICATION_TYPES.JOB_COMPLETED,
    title: 'Hoàn thành',
    body: 'Đơn đã hoàn thành',
  };

  it('error -216 → refresh once and retry once with the new token', async () => {
    const fetchMock = jest
      .fn(async (..._args: any[]) => ({ ok: true, status: 200, json: async () => ({ error: 0 }) }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: -216, message: 'invalid token' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ error: 0 }) });
    const tokenService = {
      getAccessToken: jest.fn(async () => 'tok1'),
      invalidateAndRefresh: jest.fn(async () => 'tok2'),
    };
    const service = makeService(tokenService, fetchMock);

    await service.sendForNotification(input as any);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.access_token).toBe('tok1');
    expect(tokenService.invalidateAndRefresh).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1][1].headers.access_token).toBe('tok2');
  });

  it('non-auth error → no retry', async () => {
    const fetchMock = jest
      .fn(async (..._args: any[]) => ({ ok: true, status: 200, json: async () => ({ error: 0 }) }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: -1234, message: 'other' }),
      });
    const tokenService = {
      getAccessToken: jest.fn(async () => 'tok1'),
      invalidateAndRefresh: jest.fn(async () => 'tok2'),
    };
    const service = makeService(tokenService, fetchMock);

    await service.sendForNotification(input as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenService.invalidateAndRefresh).not.toHaveBeenCalled();
  });

  it('no token at all → no send attempt', async () => {
    const fetchMock = jest.fn(async (..._args: any[]) => ({
      ok: true,
      status: 200,
      json: async () => ({ error: 0 }),
    }));
    const tokenService = {
      getAccessToken: jest.fn(async () => null),
      invalidateAndRefresh: jest.fn(async () => null),
    };
    const service = makeService(tokenService, fetchMock);

    await service.sendForNotification(input as any);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

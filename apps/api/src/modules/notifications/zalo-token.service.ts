import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ZaloTokenState, ZaloTokenStateDocument } from './schemas/zalo-token-state.schema';

/**
 * R13-I2 — refresh access token Zalo OA (sửa lỗi token tĩnh R12 item 7).
 *
 * Vấn đề: access token Zalo OA chỉ sống ~25 giờ, nhưng code cũ đọc
 * ZALO_OA_ACCESS_TOKEN từ env và dùng nguyên văn mỗi lần gửi — sau ~25 giờ
 * kể từ lúc dán token, mọi lần gửi ZNS đều lặng lẽ thất bại (chỉ có warn
 * log), trong khi thông báo trong app vẫn chạy nên không ai nhận ra.
 *
 * Cơ chế mới (OAuth v4):
 * - Cần 3 biến env (bước thủ công của chủ sở hữu, qua secure env flow —
 *   KHÔNG ghi giá trị vào code/chat/log): ZALO_APP_ID, ZALO_APP_SECRET,
 *   ZALO_OA_REFRESH_TOKEN (lấy 1 lần từ OAuth consent flow của OA).
 * - Access token được cache trong bộ nhớ + refresh chủ động trước hạn 5 phút
 *   và ngay khi Zalo trả lỗi auth (-216/-220); nhiều lần gửi đồng thời chia
 *   sẻ 1 lần refresh duy nhất (single-flight).
 * - Refresh token dùng 1 lần: token mới trả về được upsert vào Mongo NGAY
 *   (collection zalo_token_states, key 'zalo-oa') trước khi access token
 *   mới được dùng — restart server không đứt chuỗi. Lần sau ưu tiên token
 *   trong DB hơn token trong env (env chỉ là hạt giống ban đầu).
 * - Refresh token sống ~3 tháng: khi nó hết hạn/bị thu hồi thì không cách
 *   nào tự phục hồi — service log ERROR rõ ràng để chủ sở hữu chạy lại
 *   OAuth consent flow và cập nhật ZALO_OA_REFRESH_TOKEN.
 * - Chưa cấu hình OAuth (trạng thái hiện tại — chưa có tài khoản OA) thì
 *   hành vi giữ nguyên như cũ: dùng token tĩnh từ env, ZNS tự bỏ qua khi
 *   thiếu token/template.
 *
 * LƯU Ý khi kích hoạt OA lần đầu: Zalo đã gộp ZNS vào mô hình "ZBS Template
 * Message" (từ 01/01/2026) — kiểm tra lại endpoint gửi template
 * (business.openapi.zalo.me/message/template) và endpoint refresh dưới đây
 * theo tài liệu Zalo hiện hành trước lần gửi thật đầu tiên.
 */
export const ZALO_OA_TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh trước hạn 5 phút
const TOKEN_STATE_KEY = 'zalo-oa';

interface ZaloTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: number;
  message?: string;
}

type FetchFn = (
  input: string,
  init?: Record<string, unknown>,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

@Injectable()
export class ZaloTokenService {
  private readonly logger = new Logger(ZaloTokenService.name);
  private cachedAccessToken: string | null = null;
  private cachedExpiresAt = 0; // epoch ms
  private refreshPromise: Promise<string | null> | null = null;
  private storedRefreshToken: string | null = null;
  private storedRefreshTokenLoaded = false;
  private readonly fetchImpl: FetchFn;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @InjectModel(ZaloTokenState.name)
    private readonly tokenStateModel?: Model<ZaloTokenStateDocument>,
    @Optional() @Inject('ZALO_FETCH') fetchFn?: FetchFn,
  ) {
    this.fetchImpl = fetchFn ?? (globalThis.fetch as unknown as FetchFn);
  }

  /**
   * Trả về access token còn hạn: cache → refresh (nếu đã cấu hình OAuth)
   * → token tĩnh từ env. Trả null khi không có token nào. KHÔNG throw.
   */
  async getAccessToken(): Promise<string | null> {
    if (this.cachedAccessToken && Date.now() < this.cachedExpiresAt - REFRESH_BUFFER_MS) {
      return this.cachedAccessToken;
    }
    if (await this.canRefresh()) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) return refreshed;
      // Refresh thất bại — rơi xuống token tĩnh (nếu còn) thay vì mất hẳn ZNS.
    }
    return this.configService.get<string>('zalo.accessToken') || null;
  }

  /** Refresh 1 lần, chia sẻ giữa các lần gọi đồng thời (single-flight). KHÔNG throw. */
  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /** Hủy cache rồi refresh — dùng sau khi Zalo trả lỗi auth (-216/-220). KHÔNG throw. */
  async invalidateAndRefresh(): Promise<string | null> {
    this.cachedAccessToken = null;
    this.cachedExpiresAt = 0;
    return this.refreshAccessToken();
  }

  private async canRefresh(): Promise<boolean> {
    if (!this.configService.get<string>('zalo.appId')) return false;
    if (!this.configService.get<string>('zalo.appSecret')) return false;
    return !!(await this.getRefreshToken());
  }

  /** Refresh token: ưu tiên bản đã xoay trong DB, fallback về env (hạt giống ban đầu). */
  private async getRefreshToken(): Promise<string | null> {
    if (!this.storedRefreshTokenLoaded) {
      this.storedRefreshTokenLoaded = true;
      try {
        const doc = await this.tokenStateModel
          ?.findOne({ key: TOKEN_STATE_KEY })
          .lean()
          .exec();
        this.storedRefreshToken = doc?.refresh_token ?? null;
      } catch (err) {
        this.logger.warn(
          `Zalo token refresh: không đọc được refresh token đã lưu: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }
    return this.storedRefreshToken ?? this.configService.get<string>('zalo.refreshToken') ?? null;
  }

  private async doRefresh(): Promise<string | null> {
    const appId = this.configService.get<string>('zalo.appId') || '';
    const appSecret = this.configService.get<string>('zalo.appSecret') || '';
    const refreshToken = await this.getRefreshToken();
    if (!appId || !appSecret || !refreshToken) return null;

    let res: { ok: boolean; status: number; json: () => Promise<unknown> };
    try {
      res = await this.fetchImpl(ZALO_OA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          app_id: appId,
          secret_key: appSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      // Lỗi mạng/tạm thời — KHÔNG kết luận refresh token hỏng, lần gửi sau thử lại.
      this.logger.warn(
        `Zalo token refresh: lỗi mạng (${err instanceof Error ? err.message : 'unknown'}), giữ token cũ`,
      );
      return null;
    }

    const json = (await res.json().catch(() => null)) as ZaloTokenResponse | null;
    if (!json?.access_token) {
      // Zalo trả lỗi → chuỗi refresh đã đứt (refresh token hết hạn ~3 tháng
      // hoặc bị thu hồi): chỉ chạy lại OAuth consent flow thủ công mới cứu được.
      this.logger.error(
        `Zalo token refresh THẤT BẠI (error=${json?.error ?? res.status}: ${json?.message ?? 'unknown'}) — refresh token có thể đã hết hạn hoặc bị thu hồi. Cần chạy lại OAuth consent flow và cập nhật ZALO_OA_REFRESH_TOKEN, nếu không ZNS sẽ không gửi được.`,
      );
      return null;
    }

    const expiresInMs = (json.expires_in ?? 90000) * 1000; // Zalo OA: ~25 giờ
    this.cachedAccessToken = json.access_token;
    this.cachedExpiresAt = Date.now() + expiresInMs;

    // Refresh token dùng 1 LẦN — lưu NGAY token mới trước khi dùng access
    // token mới; nếu không, lần refresh sau sẽ dùng token cũ (đã bị vô hiệu).
    if (json.refresh_token && json.refresh_token !== refreshToken) {
      try {
        await this.tokenStateModel
          ?.findOneAndUpdate(
            { key: TOKEN_STATE_KEY },
            { $set: { refresh_token: json.refresh_token } },
            { upsert: true, new: true },
          )
          .exec();
        this.storedRefreshToken = json.refresh_token;
      } catch (err) {
        this.logger.error(
          `Zalo token refresh: KHÔNG lưu được refresh token mới — lần refresh sau có thể thất bại, cần cập nhật ZALO_OA_REFRESH_TOKEN thủ công. Lỗi: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }
    return this.cachedAccessToken;
  }
}

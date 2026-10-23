import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as http2 from 'node:http2';
import { createSign } from 'node:crypto';
import { User, UserDocument } from '../users/schemas/user.schema';

/**
 * Đánh thức cuộc gọi đến khi app của phía nhận đang chạy nền / đã bị đóng
 * hẳn — lớp bổ sung cho socket CALL_INCOMING (chỉ tới được khi app còn sống):
 *
 *   iOS    — APNs VoIP push (PushKit) qua HTTP/2: JWT ES256 ký bằng khóa .p8
 *            (node:crypto thuần, không thêm dependency), topic = <bundleId>.voip.
 *   Android — FCM HTTP v1 data message độ ưu tiên HIGH: OAuth2 bằng JWT của
 *            service account (RS256, node:crypto + fetch thuần).
 *
 * Toàn bộ ENV-GATED: thiếu env của kênh nào thì kênh đó no-op êm (log 1 lần).
 * KHÔNG BAO GIỜ ném lỗi ra ngoài — đường gọi chính (socket + Stringee) không
 * được phép bị ảnh hưởng bởi lớp đánh thức này.
 *
 * Env cần để KÍCH HOẠT (xem greenhouse-backlog/README.md, Batch 2):
 *   APNS_VOIP_KEY_ID, APNS_VOIP_TEAM_ID, APNS_VOIP_KEY_CONTENT (nội dung .p8),
 *   APNS_VOIP_BUNDLE_ID, APNS_VOIP_ENV (production | sandbox, mặc định production)
 *   FIREBASE_SERVICE_ACCOUNT_JSON (toàn bộ JSON của service account)
 */

export interface IncomingCallWake {
  /** ID phiên gọi (CallSession._id) — mobile join-token + trả lời bằng ID này */
  sessionId: string;
  callerId: string;
  callerName: string;
  jobId: string;
}

export interface VoipWakeResult {
  /** Số thiết bị gửi thành công */
  sent: number;
  /** true = cả 2 kênh đều chưa cấu hình env → bỏ qua êm, không phải lỗi */
  skipped: boolean;
}

interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface TokenSendResult {
  ok: boolean;
  /** Token chết (APNs 410/BadDeviceToken, FCM UNREGISTERED) → cần gỡ khỏi user */
  dead: boolean;
}

const b64urlJson = (obj: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');

@Injectable()
export class VoipPushService {
  private readonly logger = new Logger(VoipPushService.name);
  private warnedUnconfigured = false;
  private apnsJwtCache: { token: string; issuedAtMs: number } | null = null;
  private fcmTokenCache: { token: string; expiresAtMs: number } | null = null;
  private serviceAccountCache: FirebaseServiceAccount | null | undefined = undefined;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  // ─── Cấu hình ───────────────────────────────────────────────────────────────

  private env(key: string): string | undefined {
    return this.configService.get<string>(key) || undefined;
  }

  isApnsConfigured(): boolean {
    return !!(
      this.env('APNS_VOIP_KEY_ID') &&
      this.env('APNS_VOIP_TEAM_ID') &&
      this.env('APNS_VOIP_KEY_CONTENT') &&
      this.env('APNS_VOIP_BUNDLE_ID')
    );
  }

  private firebaseServiceAccount(): FirebaseServiceAccount | null {
    if (this.serviceAccountCache !== undefined) return this.serviceAccountCache;
    const raw = this.env('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!raw) {
      this.serviceAccountCache = null;
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<FirebaseServiceAccount>;
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error('thiếu project_id/client_email/private_key');
      }
      this.serviceAccountCache = parsed as FirebaseServiceAccount;
    } catch (err) {
      this.logger.warn(
        `FIREBASE_SERVICE_ACCOUNT_JSON không hợp lệ (${(err as Error).message}) — kênh FCM VoIP tắt`,
      );
      this.serviceAccountCache = null;
    }
    return this.serviceAccountCache;
  }

  isFcmConfigured(): boolean {
    return this.firebaseServiceAccount() !== null;
  }

  // ─── Điểm vào duy nhất ──────────────────────────────────────────────────────

  /**
   * Gửi "đánh thức cuộc gọi đến" tới mọi thiết bị của callee đã đăng ký
   * VoIP token. Best-effort tuyệt đối: mọi lỗi đều được nuốt + log.
   */
  async notifyIncomingCall(userId: string, wake: IncomingCallWake): Promise<VoipWakeResult> {
    const apnsReady = this.isApnsConfigured();
    const fcmReady = this.isFcmConfigured();
    if (!apnsReady && !fcmReady) {
      if (!this.warnedUnconfigured) {
        this.warnedUnconfigured = true;
        this.logger.warn(
          'VoIP push chưa cấu hình (thiếu APNS_VOIP_* và FIREBASE_SERVICE_ACCOUNT_JSON) — ' +
            'cuộc gọi đến khi app nền/đóng hẳn sẽ không đánh thức được thiết bị.',
        );
      }
      return { sent: 0, skipped: true };
    }

    try {
      const user = await this.userModel.findById(userId).select('voip_tokens').exec();
      const entries = user?.voip_tokens ?? [];
      let sent = 0;
      const deadTokens: string[] = [];
      for (const entry of entries) {
        try {
          const result =
            entry.platform === 'ios'
              ? apnsReady
                ? await this.sendApnsVoip(entry.token, wake)
                : { ok: false, dead: false }
              : fcmReady
                ? await this.sendFcmWake(entry.token, wake)
                : { ok: false, dead: false };
          if (result.ok) sent += 1;
          if (result.dead) deadTokens.push(entry.token);
        } catch (err) {
          // 1 token lỗi không chặn các token còn lại, và không bao giờ ném ra.
          this.logger.warn(`Gửi VoIP wake thất bại: ${(err as Error).message}`);
        }
      }
      if (deadTokens.length > 0) {
        await this.userModel
          .findByIdAndUpdate(userId, {
            $pull: { voip_tokens: { token: { $in: deadTokens } } },
          })
          .exec();
      }
      return { sent, skipped: false };
    } catch (err) {
      this.logger.warn(`notifyIncomingCall thất bại: ${(err as Error).message}`);
      return { sent: 0, skipped: false };
    }
  }

  // ─── APNs VoIP (iOS) ────────────────────────────────────────────────────────

  /** JWT ES256 cho APNs provider API — cache ~50 phút (APNs cho phép tái dùng ≤ 1h) */
  private apnsJwt(): string {
    const now = Date.now();
    if (this.apnsJwtCache && now - this.apnsJwtCache.issuedAtMs < 50 * 60 * 1000) {
      return this.apnsJwtCache.token;
    }
    const keyId = this.env('APNS_VOIP_KEY_ID') as string;
    const teamId = this.env('APNS_VOIP_TEAM_ID') as string;
    const keyContent = (this.env('APNS_VOIP_KEY_CONTENT') as string).replace(/\\n/g, '\n');
    const signingInput = `${b64urlJson({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64urlJson({
      iss: teamId,
      iat: Math.floor(now / 1000),
    })}`;
    const signer = createSign('SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign({ key: keyContent, dsaEncoding: 'ieee-p1363' });
    const token = `${signingInput}.${signature.toString('base64url')}`;
    this.apnsJwtCache = { token, issuedAtMs: now };
    return token;
  }

  private sendApnsVoip(deviceToken: string, wake: IncomingCallWake): Promise<TokenSendResult> {
    const bundleId = this.env('APNS_VOIP_BUNDLE_ID') as string;
    const host =
      this.env('APNS_VOIP_ENV') === 'sandbox'
        ? 'https://api.sandbox.push.apple.com'
        : 'https://api.push.apple.com';
    const body = JSON.stringify({
      aps: { 'content-available': 1 },
      type: 'incoming_call',
      call_id: wake.sessionId,
      session_id: wake.sessionId,
      caller_id: wake.callerId,
      caller_name: wake.callerName,
      job_id: wake.jobId,
    });

    return new Promise<TokenSendResult>(resolve => {
      let settled = false;
      const done = (r: TokenSendResult) => {
        if (!settled) {
          settled = true;
          resolve(r);
        }
      };
      let client: http2.ClientHttp2Session;
      try {
        client = http2.connect(host);
      } catch {
        done({ ok: false, dead: false });
        return;
      }
      client.on('error', () => done({ ok: false, dead: false }));
      let jwt: string;
      try {
        jwt = this.apnsJwt();
      } catch (err) {
        this.logger.warn(`Không ký được APNs JWT: ${(err as Error).message}`);
        client.close();
        done({ ok: false, dead: false });
        return;
      }
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${jwt}`,
        'apns-push-type': 'voip',
        'apns-topic': `${bundleId}.voip`,
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      });
      let status = 0;
      let data = '';
      req.on('response', headers => {
        status = Number(headers[':status'] ?? 0);
      });
      req.setEncoding('utf8');
      req.on('data', chunk => {
        data += chunk;
      });
      req.on('end', () => {
        client.close();
        const dead = status === 410 || (status === 400 && data.includes('BadDeviceToken'));
        done({ ok: status === 200, dead });
      });
      req.on('error', () => {
        client.close();
        done({ ok: false, dead: false });
      });
      req.end(body);
    });
  }

  // ─── FCM HTTP v1 (Android) ──────────────────────────────────────────────────

  /** Đổi JWT của service account lấy access token OAuth2 (cache tới gần hết hạn) */
  private async fcmAccessToken(sa: FirebaseServiceAccount): Promise<string> {
    const now = Date.now();
    if (this.fcmTokenCache && now < this.fcmTokenCache.expiresAtMs - 60_000) {
      return this.fcmTokenCache.token;
    }
    const nowSec = Math.floor(now / 1000);
    const signingInput = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const assertion = `${signingInput}.${signer.sign(sa.private_key).toString('base64url')}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(`OAuth2 token exchange thất bại: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in?: number };
    this.fcmTokenCache = {
      token: json.access_token,
      expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
    };
    return json.access_token;
  }

  private async sendFcmWake(deviceToken: string, wake: IncomingCallWake): Promise<TokenSendResult> {
    const sa = this.firebaseServiceAccount();
    if (!sa) return { ok: false, dead: false };
    const accessToken = await this.fcmAccessToken(sa);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            // Data-only + HIGH priority: app tự dựng giao diện cuộc gọi
            // (CallKeep), không để hệ thống hiển thị notification thường.
            data: {
              type: 'incoming_call',
              call_id: wake.sessionId,
              session_id: wake.sessionId,
              caller_id: wake.callerId,
              caller_name: wake.callerName,
              job_id: wake.jobId,
            },
            android: { priority: 'HIGH', ttl: '0s' },
          },
        }),
      },
    );
    if (res.ok) return { ok: true, dead: false };
    const text = await res.text().catch(() => '');
    return { ok: false, dead: text.includes('UNREGISTERED') };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { CallProvider } from './call-provider.interface';

/**
 * Stringee adapter (https://stringee.com) — nhà cung cấp VoIP của Việt Nam.
 *
 * Credentials CHỈ đọc từ biến môi trường (xem .env.example ở root repo):
 *   STRINGEE_API_KEY_SID    — API Key SID của project Stringee
 *   STRINGEE_API_KEY_SECRET — API Key Secret tương ứng
 *
 * Access token theo chuẩn Stringee: JWT (HS256) ký bằng API Key Secret với
 * claims { jti: "<SID>-<timestamp>", iss: <SID>, exp, userId }.
 * Mobile dùng token này để connect StringeeClient của SDK phía client.
 * KHÔNG BAO GIỜ hardcode secret vào code.
 */
@Injectable()
export class StringeeProvider implements CallProvider {
  readonly name = 'stringee';
  private readonly logger = new Logger(StringeeProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private get sid(): string | undefined {
    return this.configService.get<string>('STRINGEE_API_KEY_SID') || undefined;
  }

  private get secret(): string | undefined {
    return this.configService.get<string>('STRINGEE_API_KEY_SECRET') || undefined;
  }

  isConfigured(): boolean {
    return !!this.sid && !!this.secret;
  }

  async createAccessToken(userId: string): Promise<{ token: string; expires_at: Date }> {
    const sid = this.sid;
    const secret = this.secret;
    if (!sid || !secret) {
      throw new Error('Stringee chưa được cấu hình (thiếu STRINGEE_API_KEY_SID/SECRET)');
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = 3600; // 1 giờ — đủ dài cho 1 ca làm việc
    const token = jwt.sign(
      {
        jti: `${sid}-${nowSeconds}`,
        iss: sid,
        userId,
      },
      secret,
      { algorithm: 'HS256', expiresIn: ttlSeconds },
    );
    return { token, expires_at: new Date((nowSeconds + ttlSeconds) * 1000) };
  }
}

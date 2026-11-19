import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NOTIFICATION_TYPES } from '@homemate/constants';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ZaloTokenService } from './zalo-token.service';

/**
 * Thông báo qua Zalo OA bằng ZNS template (Feature 19).
 *
 * Chỉ gửi cho các loại thông báo quan trọng (KEY_TYPES dưới đây) và CHỈ khi
 * server đã cấu hình ZALO_OA_ACCESS_TOKEN + ZALO_ZNS_TEMPLATE_ID — thiếu một
 * trong hai thì bỏ qua lặng lẽ. Hàm sendForNotification KHÔNG BAO GIỜ throw:
 * mọi lỗi (mạng, Zalo trả error, không có SĐT...) chỉ log warn để luồng tạo
 * thông báo trong app không bao giờ bị ảnh hưởng.
 *
 * R13-I2: access token lấy qua ZaloTokenService — tự refresh trước hạn
 * (OAuth v4, xem zalo-token.service.ts); khi Zalo trả lỗi auth (-216/-220)
 * thì refresh 1 lần rồi gửi lại 1 lần. Chưa cấu hình OAuth thì dùng token
 * tĩnh từ env như trước (hành vi cũ).
 *
 * KEY_TYPES dùng đúng các hằng NOTIFICATION_TYPES đang tồn tại:
 * - QUOTE_ACCEPTED      báo giá được chọn
 * - JOB_CONFIRMED       đơn đã xác nhận
 * - HELPER_ON_THE_WAY   thợ đang trên đường đến
 * - JOB_COMPLETED       hoàn thành đơn
 * - PAYMENT_SUCCESS     thanh toán thành công
 * - WITHDRAWAL_PROCESSED yêu cầu rút tiền đã xử lý
 * (Phân xử tranh chấp: chưa có hằng NOTIFICATION_TYPES riêng cho sự kiện này
 *  trong packages/constants nên tạm không gửi Zalo.)
 */
const KEY_TYPES = new Set<string>([
  NOTIFICATION_TYPES.QUOTE_ACCEPTED,
  NOTIFICATION_TYPES.JOB_CONFIRMED,
  NOTIFICATION_TYPES.HELPER_ON_THE_WAY,
  NOTIFICATION_TYPES.JOB_COMPLETED,
  NOTIFICATION_TYPES.PAYMENT_SUCCESS,
  NOTIFICATION_TYPES.WITHDRAWAL_PROCESSED,
]);

interface ZaloNotificationInput {
  _id?: unknown;
  user_id: string;
  type: string;
  title: string;
  body: string;
}

@Injectable()
export class ZaloNotificationService {
  private readonly logger = new Logger(ZaloNotificationService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Optional() private readonly zaloTokenService?: ZaloTokenService,
  ) {}

  /** Chuẩn hoá SĐT VN sang dạng quốc tế Zalo yêu cầu: 0xxxxxxxxx → 84xxxxxxxxx. */
  private normalizePhone(raw?: string): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length >= 10) return '84' + digits.slice(1);
    if (digits.startsWith('84') && digits.length >= 11) return digits;
    return null;
  }

  async sendForNotification(n: ZaloNotificationInput): Promise<void> {
    try {
      const templateId = this.configService.get<string>('zalo.znsTemplateId') || '';
      if (!templateId) return; // Chưa cấu hình Zalo OA → bỏ qua
      if (!KEY_TYPES.has(n.type)) return;
      if (!Types.ObjectId.isValid(n.user_id)) return;

      // R13-I2: token qua ZaloTokenService (tự refresh); fallback token tĩnh
      // từ env khi service chưa có / chưa cấu hình OAuth.
      const tokenFromService = this.zaloTokenService
        ? await this.zaloTokenService.getAccessToken()
        : null;
      const accessToken =
        tokenFromService ?? this.configService.get<string>('zalo.accessToken') ?? '';
      if (!accessToken) return;

      const user = await this.userModel.findById(n.user_id).select('phone').lean().exec();
      const phone = this.normalizePhone(user?.phone);
      if (!phone) return;

      let result = await this.postTemplate(accessToken, phone, templateId, n);
      if (this.isAuthError(result)) {
        // Token hết hạn/không hợp lệ → refresh 1 lần rồi gửi lại 1 lần.
        const fresh = await this.zaloTokenService?.invalidateAndRefresh();
        if (fresh && fresh !== accessToken) {
          result = await this.postTemplate(fresh, phone, templateId, n);
        }
      }
      const json = result.json;
      if (!json || json.error !== 0) {
        // Chỉ log 4 số cuối SĐT — không log SĐT đầy đủ hay access token.
        this.logger.warn(
          `Zalo ZNS gửi thất bại (type=${n.type}, phone=***${phone.slice(-4)}, error=${json?.error ?? 'unknown'}: ${json?.message ?? result.status})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Zalo ZNS lỗi không mong đợi (type=${n.type}): ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  /** Lỗi auth của Zalo: access token không hợp lệ (-216) hoặc đã hết hạn (-220), hoặc HTTP 401. */
  private isAuthError(result: {
    json: { error?: number; message?: string } | null;
    status: number;
  }): boolean {
    return result.json?.error === -216 || result.json?.error === -220 || result.status === 401;
  }

  private async postTemplate(
    accessToken: string,
    phone: string,
    templateId: string,
    n: ZaloNotificationInput,
  ): Promise<{ json: { error?: number; message?: string } | null; status: number }> {
    const res = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: accessToken },
      body: JSON.stringify({
        phone,
        template_id: templateId,
        template_data: { title: n.title, content: n.body },
        tracking_id: n._id ? String(n._id) : undefined,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json().catch(() => null)) as {
      error?: number;
      message?: string;
    } | null;
    return { json, status: res.status };
  }
}

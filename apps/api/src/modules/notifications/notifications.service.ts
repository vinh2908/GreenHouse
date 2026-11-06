import { Injectable, Inject, NotFoundException, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NOTIFICATION_TYPES, SOCKET_EVENTS } from '@homemate/constants';
import { AppGateway } from '../chat/app.gateway';
import { ZaloNotificationService } from './zalo.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/receipts';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => AppGateway))
    private gateway: AppGateway,
    private readonly zaloService: ZaloNotificationService,
  ) {}

  /**
   * F9 (A3) & F18 (R4): Kiểm tra cài đặt thông báo của user.
   * Riêng thông báo SOS khẩn cấp (sos_*) KHÔNG BAO GIỜ bị chặn.
   */
  isNotificationAllowed(notifType: string, settings?: any): boolean {
    // F18: Thông báo SOS khẩn cấp bỏ qua bộ lọc cài đặt
    if (notifType.startsWith('sos_') || notifType.includes('sos')) {
      return true;
    }

    const s = settings || {
      order_updates: true,
      chat_messages: true,
      promotions: true,
      vouchers: true,
      sound: true,
      vibration: true,
    };

    if (
      notifType.startsWith('job_') ||
      notifType.startsWith('quote_') ||
      notifType.startsWith('payment_') ||
      notifType.startsWith('refund_') ||
      notifType.startsWith('monthly_contract_') ||
      notifType.startsWith('insurance_claim_') ||
      notifType.startsWith('contract_') ||
      notifType.startsWith('helper_') ||
      notifType.startsWith('cost_') ||
      notifType.startsWith('dispute_') ||
      notifType.startsWith('team_') ||
      notifType.startsWith('recurring_') ||
      notifType.startsWith('claim_') ||
      notifType.startsWith('call_') ||
      notifType === 'review_received'
    ) {
      if (s.order_updates === false) return false;
    } else if (
      notifType.startsWith('chat_') ||
      notifType.startsWith('support_') ||
      notifType === 'new_message'
    ) {
      if (s.chat_messages === false) return false;
    } else if (
      notifType.startsWith('promotion_') ||
      notifType === 'promotion' ||
      notifType === 'bonus'
    ) {
      if (s.promotions === false) return false;
    } else if (notifType.startsWith('voucher_') || notifType === 'voucher') {
      if (s.vouchers === false) return false;
    }

    return true;
  }

  async create(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }): Promise<NotificationDocument | null> {
    // F9 (A3): Kiểm tra cài đặt trước khi lưu DB và phát socket
    const user = await this.userModel
      .findById(data.userId)
      .select('notification_settings')
      .lean()
      .exec();
    const settings = (user as any)?.notification_settings;

    if (!this.isNotificationAllowed(data.type, settings)) {
      this.logger.log(
        `[create] Notification skipped for userId=${data.userId} due to muted settings (type=${data.type})`,
      );
      return null;
    }

    const notification = await this.notificationModel.create({
      user_id: new Types.ObjectId(data.userId),
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.payload,
    });

    // Realtime: push notification event to user's socket room
    try {
      this.gateway.emitToUser(data.userId, SOCKET_EVENTS.NOTIFICATION_NEW, {
        _id: String(notification._id),
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        is_read: false,
        created_at: notification.created_at,
      });
    } catch {
      // Ignore socket error if user is offline
    }

    // OS push (Expo Push Service): fire-and-forget — khi app bị đóng/nền, socket
    // không tới được nên đây là đường duy nhất để user thấy thông báo. Mọi lỗi
    // (không có token, token hết hạn, mạng...) đều nuốt tại đây, không làm hỏng create().
    void this.sendExpoPush(data.userId, data.title, data.body, {
      type: data.type,
      ...(data.payload ?? {}),
    }).catch(() => undefined);

    // Zalo OA (Feature 19): fire-and-forget — service tự bỏ qua khi chưa cấu
    // hình OA và không bao giờ throw, nên không thể làm hỏng luồng tạo thông báo.
    void this.zaloService
      .sendForNotification({
        _id: notification._id,
        user_id: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
      })
      .catch(() => undefined);

    return notification;
  }

  // A77: Gửi thông báo bền + phát socket tới toàn bộ Quản trị viên
  async notifyAdmins(data: {
    type: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const admins = await this.userModel.find({ roles: 'admin' }).select('_id').lean().exec();
      await Promise.allSettled(
        admins.map(admin =>
          this.create({
            userId: String(admin._id),
            type: data.type,
            title: data.title,
            body: data.body,
            payload: data.payload,
          }),
        ),
      );
      // A83: this.create đã emit NOTIFICATION_NEW và gửi Expo Push tới từng admin riêng biệt.
      // Chỉ emit admin:pending_update tới room:admins để cập nhật badge/counter tức thì, tránh nhận 2 lần.
      this.gateway.emitToAdmins('admin:pending_update', {
        type: data.type,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Failed to notify admins: ${(err as Error).message}`);
    }
  }

  /**
   * Gửi OS push tới mọi thiết bị của user qua Expo Push Service.
   * data đính kèm luôn chứa `type` + toàn bộ payload gốc để app deep-link
   * đúng màn hình khi user chạm vào push (xem utils/notification-route.ts phía mobile).
   * Không bao giờ throw.
   */
  private async sendExpoPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        this.logger.warn(`[sendExpoPush] Invalid userId: ${userId}`);
        return;
      }
      const user = await this.userModel
        .findById(userId)
        .select('push_tokens notification_settings')
        .lean()
        .exec();

      const notifType = String(data?.type || '');
      const settings = (user as any)?.notification_settings;

      if (!this.isNotificationAllowed(notifType, settings)) {
        this.logger.log(
          `[sendExpoPush] Skipped push for userId=${userId} due to user notification settings (type=${notifType})`,
        );
        return;
      }
      const rawTokens = (user?.push_tokens ?? []) as string[];
      const tokens = rawTokens.filter(
        token =>
          typeof token === 'string' &&
          (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')),
      );

      if (tokens.length === 0) {
        this.logger.log(
          `[sendExpoPush] No push tokens registered for userId=${userId} (raw tokens count: ${rawTokens.length})`,
        );
        return;
      }

      this.logger.log(
        `[sendExpoPush] Dispatching push to userId=${userId}, tokens=${tokens.length}, title="${title}"`,
      );

      const messages = tokens.map(to => ({
        to,
        title,
        body,
        data,
        sound: settings.sound ? ('default' as const) : null,
        priority: 'high' as const,
        channelId: 'default',
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      this.logger.log(`[sendExpoPush] Expo push HTTP status: ${res.status}`);

      // Dọn token chết: Expo báo DeviceNotRegistered qua ticket (ngay lúc
      // gửi) hoặc qua receipt (sau khi APNs/FCM từ chối). Token nào bị báo
      // chết thì gỡ khỏi push_tokens của user để không gửi vào hư không mãi.
      try {
        const deadTokens = new Set<string>();
        const receiptIdToToken = new Map<string, string>();
        const sendResult = (await res.json().catch(() => null)) as {
          data?: Array<{
            status?: string;
            id?: string;
            message?: string;
            details?: { error?: string };
          }>;
          errors?: Array<{ message?: string; code?: string }>;
        } | null;

        if (sendResult?.errors && sendResult.errors.length > 0) {
          this.logger.warn(
            `[sendExpoPush] Expo service errors: ${JSON.stringify(sendResult.errors)}`,
          );
        }

        const tickets = sendResult?.data ?? [];
        tickets.forEach((ticket, i) => {
          const token = messages[i]?.to;
          if (!token) return;
          if (ticket?.status === 'error') {
            this.logger.warn(
              `[sendExpoPush] Ticket error for token ${token}: ${ticket.message || ticket.details?.error}`,
            );
            if (ticket?.details?.error === 'DeviceNotRegistered') {
              deadTokens.add(token);
            }
          } else if (ticket?.id) {
            this.logger.log(`[sendExpoPush] Ticket OK for token ${token}, receiptId=${ticket.id}`);
            receiptIdToToken.set(ticket.id, token);
          }
        });

        if (receiptIdToToken.size > 0) {
          const receiptRes = await fetch(EXPO_PUSH_RECEIPTS_URL, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: [...receiptIdToToken.keys()] }),
          });
          const receiptResult = (await receiptRes.json().catch(() => null)) as {
            data?: Record<
              string,
              { status?: string; message?: string; details?: { error?: string } }
            >;
          } | null;

          for (const [receiptId, receipt] of Object.entries(receiptResult?.data ?? {})) {
            if (receipt?.status === 'error') {
              this.logger.warn(
                `[sendExpoPush] Receipt error for receiptId ${receiptId}: ${receipt.message || receipt.details?.error}`,
              );
              if (receipt?.details?.error === 'DeviceNotRegistered') {
                const token = receiptIdToToken.get(receiptId);
                if (token) deadTokens.add(token);
              }
            }
          }
        }

        if (deadTokens.size > 0) {
          this.logger.warn(
            `[sendExpoPush] Pruning ${deadTokens.size} dead token(s) for userId=${userId}`,
          );
          await this.userModel
            .updateOne(
              { _id: new Types.ObjectId(userId) },
              { $pull: { push_tokens: { $in: [...deadTokens] } } },
            )
            .exec();
        }
      } catch (err: any) {
        this.logger.warn(
          `[sendExpoPush] Error processing Expo tickets/receipts: ${err?.message || err}`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `[sendExpoPush] Unexpected error for userId=${userId}: ${err?.message || err}`,
      );
    }
  }

  async getForUser(userId: string, unreadOnly = false) {
    const query: Record<string, unknown> = { user_id: new Types.ObjectId(userId) };
    if (unreadOnly) query['is_read'] = false;
    return this.notificationModel.find(query).sort({ created_at: -1 }).limit(50).exec();
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.notificationModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(notificationId), user_id: new Types.ObjectId(userId) },
        { is_read: true },
        { new: true },
      )
      .exec();
    if (!notification) throw new NotFoundException('Thông báo không tồn tại');
    return notification;
  }

  async markAllRead(userId: string) {
    return this.notificationModel
      .updateMany({ user_id: new Types.ObjectId(userId), is_read: false }, { is_read: true })
      .exec();
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel
      .countDocuments({
        user_id: new Types.ObjectId(userId),
        is_read: false,
      })
      .exec();
  }

  // System message to every active user, pushed live to everyone connected without broadcast leakage.
  async broadcastAll(userIds: Types.ObjectId[], title: string, body: string) {
    await this.notificationModel.insertMany(
      userIds.map(id => ({
        user_id: id,
        type: NOTIFICATION_TYPES.SYSTEM,
        title,
        body,
        is_read: false,
      })),
    );
    // A83: Gửi theo room riêng của từng user và push Expo, không broadcast toàn cục
    const now = new Date();
    userIds.forEach(id => {
      const uid = String(id);
      this.gateway.emitToUser(uid, SOCKET_EVENTS.NOTIFICATION_NEW, {
        type: NOTIFICATION_TYPES.SYSTEM,
        title,
        body,
        is_read: false,
        created_at: now,
      });
      void this.sendExpoPush(uid, title, body, {
        type: NOTIFICATION_TYPES.SYSTEM,
      }).catch(() => undefined);
    });
    return { sent: userIds.length };
  }

  // One unread notification per conversation: a new message replaces the previous
  // unread one (so it moves to the top) instead of piling up one per message.
  async notifyChatMessage(
    recipientId: string,
    senderName: string,
    preview: string,
    conversationId: string,
    jobId?: string,
  ) {
    const body = `${senderName}: ${preview.length > 80 ? preview.slice(0, 77) + '…' : preview}`;
    await this.notificationModel
      .deleteOne({
        user_id: new Types.ObjectId(recipientId),
        type: NOTIFICATION_TYPES.NEW_MESSAGE,
        is_read: false,
        'data.conversation_id': conversationId,
      })
      .exec();
    return this.create({
      userId: recipientId,
      type: NOTIFICATION_TYPES.NEW_MESSAGE,
      title: 'Tin nhắn mới',
      body,
      payload: { conversation_id: conversationId, job_id: jobId },
    });
  }

  async markConversationRead(userId: string, conversationId: string) {
    await this.notificationModel
      .updateMany(
        {
          user_id: new Types.ObjectId(userId),
          type: NOTIFICATION_TYPES.NEW_MESSAGE,
          is_read: false,
          'data.conversation_id': conversationId,
        },
        { is_read: true },
      )
      .exec();
  }

  // ─── Convenience helpers for specific notification types ───────────────────

  async notifyNewQuote(customerId: string, helperName: string, jobTitle: string, jobId: string) {
    return this.create({
      userId: customerId,
      type: NOTIFICATION_TYPES.NEW_QUOTE_RECEIVED,
      title: 'Báo giá mới',
      body: `${helperName} đã gửi báo giá cho công việc "${jobTitle}"`,
      payload: { job_id: jobId },
    });
  }

  async notifyQuoteAccepted(helperId: string, jobTitle: string, jobId: string) {
    return this.create({
      userId: helperId,
      type: NOTIFICATION_TYPES.QUOTE_ACCEPTED,
      title: 'Báo giá được chọn!',
      body: `Chúc mừng! Khách hàng đã chọn báo giá của bạn cho "${jobTitle}"`,
      payload: { job_id: jobId },
    });
  }

  async notifyQuoteRejected(helperId: string, jobTitle: string, jobId: string, quoteId?: string) {
    return this.create({
      userId: helperId,
      type: NOTIFICATION_TYPES.QUOTE_REJECTED,
      title: 'Báo giá không được chọn',
      body: `Khách hàng đã chọn báo giá khác cho công việc "${jobTitle}"`,
      payload: { job_id: jobId, ...(quoteId ? { quote_id: quoteId } : {}) },
    });
  }

  async notifyJobCompleted(customerId: string, jobTitle: string, jobId: string) {
    return this.create({
      userId: customerId,
      type: NOTIFICATION_TYPES.JOB_COMPLETED,
      title: 'Hoàn thành công việc',
      body: `Công việc "${jobTitle}" đã được hoàn thành. Vui lòng nghiệm thu.`,
      payload: { job_id: jobId },
    });
  }

  async getSettings(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('User not found');
    }
    const user = await this.userModel
      .findById(userId)
      .select('notification_settings')
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return (
      (user as any).notification_settings || {
        order_updates: true,
        chat_messages: true,
        promotions: true,
        vouchers: true,
        sound: true,
        vibration: true,
      }
    );
  }

  async updateSettings(
    userId: string,
    settings: Partial<{
      order_updates: boolean;
      chat_messages: boolean;
      promotions: boolean;
      vouchers: boolean;
      sound: boolean;
      vibration: boolean;
    }>,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('User not found');
    }
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const current = (user as any).notification_settings || {
      order_updates: true,
      chat_messages: true,
      promotions: true,
      vouchers: true,
      sound: true,
      vibration: true,
    };
    (user as any).notification_settings = {
      ...current,
      ...settings,
    };
    await user.save();
    return (user as any).notification_settings;
  }
}
